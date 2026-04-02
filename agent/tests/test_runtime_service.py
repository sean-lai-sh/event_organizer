from __future__ import annotations

from collections.abc import AsyncIterator

import pytest

from runtime.contracts import ApprovalDecisionRequest, ApprovalStatus, RunCreateRequest, ThreadCreateRequest
from runtime.policy import ApprovalPolicy
from runtime.service import AgentRuntimeService
from runtime.store import InMemoryRuntimeStore


class FakeAdapter:
    model = "fake-model"

    async def stream_text(self, *, user_prompt: str, system_prompt: str | None = None, max_tokens: int = 900) -> AsyncIterator[str]:
        _ = (system_prompt, max_tokens)
        yield f"Processed: {user_prompt[:20]}"
        yield f"Processed: {user_prompt[:20]} complete"


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
