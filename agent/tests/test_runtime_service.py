from __future__ import annotations

import json
from collections.abc import AsyncIterator

import pytest

import runtime.service as runtime_service
from runtime.anthropic_adapter import AgentTurnResult, ToolTrace
from runtime.contracts import ApprovalDecisionRequest, ApprovalStatus, RunCreateRequest, ThreadCreateRequest
from runtime.policy import ActionClass, ApprovalPolicy, ToolAction
from runtime.service import AgentRuntimeService
from runtime.store import InMemoryRuntimeStore


class FakeAdapter:
    model = "fake-model"

    async def stream_text(self, *, user_prompt: str, system_prompt: str | None = None, max_tokens: int = 900) -> AsyncIterator[str]:
        _ = (system_prompt, max_tokens)
        yield f"Processed: {user_prompt[:20]}"
        yield f"Processed: {user_prompt[:20]} complete"


class FakeToolAwareAdapter:
    model = "fake-agent-sdk"

    def __init__(self, result: AgentTurnResult | list[AgentTurnResult]) -> None:
        if isinstance(result, list):
            self._results = list(result)
        else:
            self._results = [result]
        self.calls: list[dict[str, object]] = []

    async def run_agent(self, *, user_prompt: str, system_prompt: str | None = None, max_turns: int = 6) -> AgentTurnResult:
        self.calls.append(
            {
                "user_prompt": user_prompt,
                "system_prompt": system_prompt,
                "max_turns": max_turns,
            }
        )
        return self._results.pop(0)

    async def stream_text(
        self,
        *,
        user_prompt: str,
        system_prompt: str | None = None,
        max_tokens: int = 900,
    ) -> AsyncIterator[str]:
        _ = (user_prompt, system_prompt, max_tokens)
        yield "Approved tool executed"
        yield "Approved tool executed successfully"


@pytest.mark.asyncio
async def test_start_run_without_approval_completes() -> None:
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=FakeAdapter(),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Test thread"))
    response = await service.start_run(RunCreateRequest(thread_id=thread.external_id, input_text="Summarize the agenda"))

    assert response.run.status.value == "completed"

    state = await service.get_thread_state(thread.external_id)
    assert len(state.messages) >= 2
    assert any(message.role == "assistant" for message in state.messages)
    assert len(state.artifacts) == 1
    assert not state.approvals


@pytest.mark.asyncio
async def test_start_run_with_send_pauses_for_approval_and_resumes() -> None:
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=FakeAdapter(),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Approval thread"))
    response = await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Send outreach email to speakers")
    )

    assert response.run.status.value == "paused_approval"

    state = await service.get_thread_state(thread.external_id)
    assert len(state.approvals) == 1
    approval = state.approvals[0]
    assert approval.status.value == "pending"

    decision = await service.submit_approval(
        approval.external_id,
        ApprovalDecisionRequest(decision=ApprovalStatus.APPROVED),
    )

    assert decision.approval.status.value == "approved"
    assert decision.run.status.value == "completed"


@pytest.mark.asyncio
async def test_rejected_approval_finalizes_without_execution() -> None:
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=FakeAdapter(),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Reject thread"))
    response = await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Delete this event")
    )
    assert response.run.status.value == "paused_approval"

    state = await service.get_thread_state(thread.external_id)
    approval = state.approvals[0]

    decision = await service.submit_approval(
        approval.external_id,
        ApprovalDecisionRequest(decision=ApprovalStatus.REJECTED),
    )

    assert decision.approval.status.value == "rejected"
    assert decision.run.status.value == "completed"


@pytest.mark.asyncio
async def test_tool_aware_read_run_completes_without_approval() -> None:
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=FakeToolAwareAdapter(
            AgentTurnResult(
                text_deltas=["Checking dashboard", "Attendance summary ready"],
                final_text="Attendance summary ready",
                tool_traces=[
                    ToolTrace(
                        name="get_attendance_dashboard",
                        tool_input={},
                        tool_use_id="tool_1",
                        result={"totals": {"events_tracked": 2}},
                    )
                ],
            )
        ),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Read thread"))
    response = await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="How is attendance looking?")
    )

    assert response.run.status.value == "completed"
    event_names = [event.event for event in response.events]
    assert "tool.planned" in event_names
    assert "tool.completed" in event_names
    assert "approval.requested" not in event_names


@pytest.mark.asyncio
async def test_tool_aware_write_run_pauses_then_executes_exact_tool(monkeypatch: pytest.MonkeyPatch) -> None:
    executed: list[tuple[str, dict]] = []

    async def fake_execute_tool_call(tool_name: str, tool_input: dict) -> dict:
        executed.append((tool_name, tool_input))
        return {"_id": tool_input["event_id"], "status": tool_input["status"]}

    monkeypatch.setattr(runtime_service, "execute_tool_call", fake_execute_tool_call)

    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=FakeToolAwareAdapter(
            AgentTurnResult(
                tool_traces=[
                    ToolTrace(
                        name="update_event_safe",
                        tool_input={"event_id": "evt_1", "status": "confirmed"},
                        tool_use_id="tool_2",
                    )
                ],
                blocked_action=ToolAction(
                    name="update_event_safe",
                    action_class=ActionClass.WRITE,
                    payload={"tool_input": {"event_id": "evt_1", "status": "confirmed"}},
                ),
            )
        ),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Write thread"))
    response = await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Confirm the event")
    )

    assert response.run.status.value == "paused_approval"
    state = await service.get_thread_state(thread.external_id)
    approval = state.approvals[0]

    decision = await service.submit_approval(
        approval.external_id,
        ApprovalDecisionRequest(decision=ApprovalStatus.APPROVED),
    )

    assert executed == [("update_event_safe", {"event_id": "evt_1", "status": "confirmed"})]
    assert decision.run.status.value == "completed"


@pytest.mark.asyncio
async def test_missing_create_event_fields_produce_persisted_form_request() -> None:
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=FakeAdapter(),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Event card"))
    response = await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Create a new event")
    )

    assert response.run.status.value == "completed"
    state = await service.get_thread_state(thread.external_id)
    assistant = state.messages[-1]
    assert assistant.role == "assistant"
    block = assistant.content_blocks[0]
    assert block.kind == "form_request"
    payload = json.loads(block.data_json or "{}")
    assert payload["entity"] == "event"
    assert payload["mode"] == "create"
    field_keys = [field["key"] for field in payload["fields"]]
    assert field_keys[:2] == ["title", "event_date"]


@pytest.mark.asyncio
async def test_ambiguous_update_event_produces_choice_request(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_execute_tool_call(tool_name: str, tool_input: dict) -> list[dict]:
        assert tool_name == "list_events"
        assert tool_input == {"limit": 5}
        return [
            {"_id": "events:1", "title": "VC Panel", "event_date": "2026-05-01", "status": "draft"},
            {"_id": "events:2", "title": "AI Night", "event_date": "2026-05-08", "status": "outreach"},
        ]

    monkeypatch.setattr(runtime_service, "execute_tool_call", fake_execute_tool_call)

    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=FakeAdapter(),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Update card"))
    response = await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Update the event status to completed")
    )

    assert response.run.status.value == "completed"
    state = await service.get_thread_state(thread.external_id)
    block = state.messages[-1].content_blocks[0]
    assert block.kind == "choice_request"
    payload = json.loads(block.data_json or "{}")
    assert payload["question"] == "Which event should I update?"
    assert [choice["id"] for choice in payload["choices"]] == ["events:1", "events:2"]


@pytest.mark.asyncio
async def test_agent_form_response_continues_existing_run_path() -> None:
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=FakeToolAwareAdapter(
            AgentTurnResult(
                text_deltas=["Continuing with submitted event details."],
                final_text="Continuing with submitted event details.",
            )
        ),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Submitted card"))
    response = await service.start_run(
        RunCreateRequest(
            thread_id=thread.external_id,
            input_text=(
                "[agent-form-response]\n"
                "entity: event\n"
                "mode: create\n"
                "request_id: req_123\n"
                "title: AI & Society\n"
                "event_date: 2026-05-22\n"
                "[/agent-form-response]"
            ),
        )
    )

    assert response.run.status.value == "completed"
    state = await service.get_thread_state(thread.external_id)
    assert state.messages[-1].content_blocks[0].kind == "text"


@pytest.mark.asyncio
async def test_latest_event_attendance_retries_when_fake_limitation_skips_tools() -> None:
    adapter = FakeToolAwareAdapter(
        [
            AgentTurnResult(
                text_deltas=[
                    "I apologize, but I'm unable to retrieve the most recent event stats right now."
                ],
                final_text=(
                    "I apologize, but I'm unable to retrieve the most recent event stats right now. "
                    "Access issues are blocking me."
                ),
            ),
            AgentTurnResult(
                text_deltas=["I found the latest event attendance."],
                final_text="The latest event had 42 attendees.",
                tool_traces=[
                    ToolTrace(name="list_events", tool_input={"limit": 5}, tool_use_id="tool_1", result=[{"_id": "evt_1"}]),
                    ToolTrace(
                        name="get_event_attendance",
                        tool_input={"event_id": "evt_1"},
                        tool_use_id="tool_2",
                        result={"event": {"_id": "evt_1"}, "attendees": [{"email": "a@example.com"}]},
                    ),
                ],
            ),
        ]
    )
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=adapter,
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Attendance retry"))
    response = await service.start_run(
        RunCreateRequest(
            thread_id=thread.external_id,
            input_text="What were the latest event stats with actual attendance?",
        )
    )

    assert response.run.status.value == "completed"
    assert len(adapter.calls) == 2
    assert any(event.event == "guardrail.retry" for event in response.events)
    state = await service.get_thread_state(thread.external_id)
    assert state.messages[-1].plain_text == "The latest event had 42 attendees."


@pytest.mark.asyncio
async def test_attendance_request_with_tool_usage_does_not_retry() -> None:
    adapter = FakeToolAwareAdapter(
        AgentTurnResult(
            text_deltas=["I checked the event attendance."],
            final_text="The event currently shows 17 attendees.",
            tool_traces=[
                ToolTrace(
                    name="get_event_attendance",
                    tool_input={"event_id": "evt_9"},
                    tool_use_id="tool_1",
                    result={"event": {"_id": "evt_9"}, "attendees": [{"email": "a@example.com"}]},
                )
            ],
        )
    )
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=adapter,
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Attendance direct"))
    response = await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="How many attendees does this event have?")
    )

    assert response.run.status.value == "completed"
    assert len(adapter.calls) == 1
    assert all(event.event != "guardrail.retry" for event in response.events)


@pytest.mark.asyncio
async def test_tool_failure_names_failed_tool_in_final_answer() -> None:
    adapter = FakeToolAwareAdapter(
        AgentTurnResult(
            text_deltas=["I couldn't access that data."],
            final_text="I couldn't access the data because of authentication.",
            tool_traces=[
                ToolTrace(
                    name="list_events",
                    tool_input={"limit": 5},
                    tool_use_id="tool_1",
                    result="convex timeout",
                    is_error=True,
                )
            ],
        )
    )
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=adapter,
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Failure thread"))
    response = await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="What are the latest event stats?")
    )

    assert response.run.status.value == "completed"
    state = await service.get_thread_state(thread.external_id)
    assert "list_events" in (state.messages[-1].plain_text or "")
    assert "convex timeout" in (state.messages[-1].plain_text or "")


@pytest.mark.asyncio
async def test_latest_event_request_with_no_events_returns_no_data_message() -> None:
    adapter = FakeToolAwareAdapter(
        AgentTurnResult(
            final_text="I couldn't get the event stats.",
            tool_traces=[
                ToolTrace(
                    name="list_events",
                    tool_input={"limit": 5},
                    tool_use_id="tool_1",
                    result=[],
                )
            ],
        )
    )
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=adapter,
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="No events"))
    response = await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="What's the latest event attendance?")
    )

    assert response.run.status.value == "completed"
    state = await service.get_thread_state(thread.external_id)
    assert "couldn't find any events" in (state.messages[-1].plain_text or "").lower()
