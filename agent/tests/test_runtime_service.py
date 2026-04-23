from __future__ import annotations

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

    def __init__(self, chunks: list[str] | None = None) -> None:
        self._chunks = chunks or [
            "Processed: fallback",
            "Processed: fallback complete",
        ]

    async def stream_text(self, *, messages: list, system_prompt: str | None = None, max_tokens: int = 900) -> AsyncIterator[str]:
        _ = (messages, system_prompt, max_tokens)
        for chunk in self._chunks:
            yield chunk


class FakeToolAwareAdapter:
    model = "fake-agent-sdk"

    def __init__(self, result: AgentTurnResult | list[AgentTurnResult]) -> None:
        if isinstance(result, list):
            self._results = list(result)
        else:
            self._results = [result]
        self.calls: list[dict[str, object]] = []

    async def run_agent(self, *, messages: list, system_prompt: str | None = None, max_turns: int = 8) -> AgentTurnResult:
        self.calls.append(
            {
                "messages": messages,
                "system_prompt": system_prompt,
                "max_turns": max_turns,
            }
        )
        return self._results.pop(0)

    async def stream_text(
        self,
        *,
        messages: list,
        system_prompt: str | None = None,
        max_tokens: int = 900,
    ) -> AsyncIterator[str]:
        _ = (messages, system_prompt, max_tokens)
        yield "Approved tool executed"
        yield "Approved tool executed successfully"


@pytest.mark.asyncio
async def test_start_run_without_approval_completes() -> None:
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=FakeAdapter(
            [
                "## Attendance Update",
                "## Attendance Update\n\nThe latest event had 42 attendees.\n\n- Attendance rose from last week.",
            ]
        ),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Test thread"))
    response = await service.start_run(RunCreateRequest(thread_id=thread.external_id, input_text="Summarize the agenda"))

    assert response.run.status.value == "completed"
    assert response.run.summary == "Attendance Update"

    state = await service.get_thread_state(thread.external_id)
    assert len(state.messages) >= 2
    assert any(message.role == "assistant" for message in state.messages)
    assert len(state.artifacts) == 1
    assert not state.approvals
    assert state.thread.summary == "Attendance Update"
    assert state.artifacts[0].title == "Response"
    assert state.artifacts[0].summary == "Attendance Update"


@pytest.mark.asyncio
async def test_actionable_response_creates_checklist_artifact() -> None:
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=FakeAdapter(
            [
                "## Outreach Status",
                (
                    "## Outreach Status\n\nThe draft is ready for review.\n\n"
                    "### Next steps\n"
                    "1. Send the draft to Alex for approval.\n"
                    "2. Confirm the speaker availability window."
                ),
            ]
        ),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Actionable thread"))
    response = await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Summarize the current status")
    )

    assert response.run.status.value == "completed"
    assert response.run.summary == "Outreach Status"

    state = await service.get_thread_state(thread.external_id)
    assert state.thread.summary == "Outreach Status"
    assert [artifact.kind.value for artifact in state.artifacts] == ["report", "checklist"]
    assert state.artifacts[0].title == "Response"
    assert state.artifacts[0].summary == "Outreach Status"
    assert state.artifacts[1].title == "Next Steps"
    assert state.artifacts[1].summary == "2 action items"
    assert state.artifacts[1].content_blocks[0].kind == "checklist_data"


@pytest.mark.asyncio
async def test_sentence_summary_is_used_when_no_heading_exists() -> None:
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=FakeAdapter(
            [
                "The room is confirmed.",
                "The room is confirmed. Speaker confirmation is still pending.",
            ]
        ),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Sentence summary thread"))
    response = await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Explain the current event status")
    )

    assert response.run.status.value == "completed"
    assert response.run.summary == "The room is confirmed."

    state = await service.get_thread_state(thread.external_id)
    assert state.thread.summary == "The room is confirmed."
    assert len(state.artifacts) == 1
    assert state.artifacts[0].summary == "The room is confirmed."


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


# ──────────────────────────────────────────────────────────────────────
# New streaming-persistence tests for issue #33
# ──────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_streaming_placeholder_created_before_first_delta() -> None:
    """Assistant placeholder is created before the first delta and patched in
    place during streaming (text run path)."""
    store = InMemoryRuntimeStore()
    service = AgentRuntimeService(
        store=store,
        adapter=FakeAdapter(),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Streaming test"))
    await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Hello world")
    )

    state = await service.get_thread_state(thread.external_id)
    assistant_msgs = [m for m in state.messages if m.role == "assistant"]

    # There should be exactly one assistant message (the placeholder that was
    # patched to final), not two separate rows.
    assert len(assistant_msgs) == 1
    assert assistant_msgs[0].status == "final"
    assert assistant_msgs[0].plain_text  # non-empty final text


@pytest.mark.asyncio
async def test_streaming_finalization_patches_same_message_not_new_row() -> None:
    """Finalization updates the same assistant message to status='final'
    instead of adding a second assistant message."""
    store = InMemoryRuntimeStore()
    service = AgentRuntimeService(
        store=store,
        adapter=FakeAdapter(),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Finalize test"))
    await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Summarize something")
    )

    # Count all messages in the store keyed by external_id.
    all_msgs = list(store.messages.values())
    assistant_msgs = [m for m in all_msgs if m.role == "assistant" and m.thread_external_id == thread.external_id]

    # Only one assistant message row should exist.
    assert len(assistant_msgs) == 1
    assert assistant_msgs[0].status == "final"

    # The sequence_number should not have been advanced during streaming.
    seq = assistant_msgs[0].sequence_number
    user_msgs = [m for m in all_msgs if m.role == "user" and m.thread_external_id == thread.external_id]
    assert len(user_msgs) == 1
    assert user_msgs[0].sequence_number < seq


@pytest.mark.asyncio
async def test_tool_aware_streaming_placeholder_patched_in_place() -> None:
    """For tool-aware runs, the assistant placeholder is created before the
    first delta and patched in place during streaming."""
    store = InMemoryRuntimeStore()
    service = AgentRuntimeService(
        store=store,
        adapter=FakeToolAwareAdapter(
            AgentTurnResult(
                text_deltas=["Partial text", "Full answer ready"],
                final_text="Full answer ready",
                tool_traces=[
                    ToolTrace(
                        name="get_attendance_dashboard",
                        tool_input={},
                        tool_use_id="tool_1",
                        result={"totals": {"events_tracked": 1}},
                    )
                ],
            )
        ),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Tool streaming"))
    await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Show attendance")
    )

    state = await service.get_thread_state(thread.external_id)
    assistant_msgs = [m for m in state.messages if m.role == "assistant"]

    # Exactly one assistant message, patched to final.
    assert len(assistant_msgs) == 1
    assert assistant_msgs[0].status == "final"
    assert assistant_msgs[0].plain_text == "Full answer ready"


@pytest.mark.asyncio
async def test_completed_run_shows_final_assistant_bubble() -> None:
    """A completed run still shows the final assistant bubble (visible after
    the run completes and after a simulated page refresh via get_thread_state)."""
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=FakeAdapter(),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Bubble test"))
    response = await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Tell me something")
    )

    assert response.run.status.value == "completed"

    # Simulate a "page refresh" by fetching thread state again.
    state = await service.get_thread_state(thread.external_id)
    assistant_msgs = [m for m in state.messages if m.role == "assistant"]
    assert len(assistant_msgs) == 1
    assert assistant_msgs[0].status == "final"
    assert assistant_msgs[0].plain_text  # non-empty


@pytest.mark.asyncio
async def test_sequence_number_not_advanced_during_streaming() -> None:
    """The sequence_number of the assistant message must be assigned once at
    placeholder creation and must not change during streaming patches."""
    store = InMemoryRuntimeStore()
    service = AgentRuntimeService(
        store=store,
        adapter=FakeAdapter(),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Seq test"))
    await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Check sequence")
    )

    all_msgs = list(store.messages.values())
    assistant_msgs = [m for m in all_msgs if m.role == "assistant" and m.thread_external_id == thread.external_id]
    assert len(assistant_msgs) == 1

    # The user message gets sequence 1, assistant gets sequence 2.
    user_msg = next(m for m in all_msgs if m.role == "user" and m.thread_external_id == thread.external_id)
    assert user_msg.sequence_number == 1
    assert assistant_msgs[0].sequence_number == 2

    # The thread sequence counter should be exactly 2 (not higher from
    # streaming patches).
    assert store._thread_sequences[thread.external_id] == 2
