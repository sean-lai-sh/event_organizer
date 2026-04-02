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

    async def stream_text(self, *, user_prompt: str, system_prompt: str | None = None, max_tokens: int = 900) -> AsyncIterator[str]:
        _ = (system_prompt, max_tokens)
        yield f"Processed: {user_prompt[:20]}"
        yield f"Processed: {user_prompt[:20]} complete"


class FakeToolAwareAdapter:
    model = "fake-agent-sdk"

    def __init__(self, result: AgentTurnResult) -> None:
        self._result = result

    async def run_agent(self, *, user_prompt: str, system_prompt: str | None = None, max_turns: int = 6) -> AgentTurnResult:
        _ = (user_prompt, system_prompt, max_turns)
        return self._result

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
