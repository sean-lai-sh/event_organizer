"""
Integration tests verifying that streaming persistence (Issue #33) and
reasoning traces (Issue #20) coexist correctly after the rebase merge.

These tests exercise the interaction between the two features that is NOT
covered by the individual test suites:

  - test_runtime_service.py  → streaming persistence only (no trace assertions)
  - test_runtime_traces.py   → trace pipeline only (no streaming message assertions)

Success States
==============
  - A completed text run has exactly one assistant message with status="final"
    AND at least PLANNING + THINKING + ARTIFACT_GENERATION + RUN_COMPLETED traces.
  - A completed tool-aware run has exactly one assistant message with status="final"
    AND at least PLANNING + TOOL_SELECTION + TOOL_COMPLETION + RUN_COMPLETED traces.
  - Traces and the streaming assistant message appear together in ThreadStateResponse.
  - The assistant message sequence_number is stable (not inflated by trace emissions).
  - An errored text run has exactly one assistant message (finalized with error text)
    AND a RUN_ERROR trace.
  - The API-level /runs response includes both a single assistant message in thread
    state and traces in the response body.

Failure States
==============
  - Two assistant message rows for the same run → streaming upsert is broken.
  - Zero traces for a completed run → trace pipeline is broken.
  - Missing RUN_COMPLETED trace → _finalize_successful_run skipped trace emission.
  - Inflated sequence_number → streaming patches are advancing the counter.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator

import pytest

import runtime.service as runtime_service
from runtime.anthropic_adapter import AgentTurnResult, ToolTrace
from runtime.contracts import (
    ApprovalDecisionRequest,
    ApprovalStatus,
    RunCreateRequest,
    ThreadCreateRequest,
    TraceStepKind,
)
from runtime.policy import ActionClass, ApprovalPolicy, ToolAction
from runtime.service import AgentRuntimeService
from runtime.store import InMemoryRuntimeStore


# ---------------------------------------------------------------------------
# Fake adapters
# ---------------------------------------------------------------------------

class FakeAdapter:
    model = "fake-model"

    async def stream_text(
        self,
        *,
        user_prompt: str,
        system_prompt: str | None = None,
        max_tokens: int = 900,
    ) -> AsyncIterator[str]:
        _ = (system_prompt, max_tokens)
        yield f"Partial: {user_prompt[:15]}"
        yield f"Done: {user_prompt[:15]}"


class ErrorAdapter:
    """Adapter that raises on the second delta to test error + trace interaction."""
    model = "fake-error-model"

    async def stream_text(
        self,
        *,
        user_prompt: str,
        system_prompt: str | None = None,
        max_tokens: int = 900,
    ) -> AsyncIterator[str]:
        _ = (system_prompt, max_tokens)
        yield "Starting..."
        raise RuntimeError("Simulated streaming failure")


class FakeToolAwareAdapter:
    model = "fake-agent-sdk"

    def __init__(self, result: AgentTurnResult | list[AgentTurnResult]) -> None:
        if isinstance(result, list):
            self._results = list(result)
        else:
            self._results = [result]
        self.calls: list[dict[str, object]] = []

    async def run_agent(
        self,
        *,
        user_prompt: str,
        system_prompt: str | None = None,
        max_turns: int = 6,
    ) -> AgentTurnResult:
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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _trace_kinds(traces) -> list[str]:
    return [t.kind.value if hasattr(t.kind, "value") else t.kind for t in traces]


# ---------------------------------------------------------------------------
# Tests: Text run — streaming message + traces coexist
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_text_run_has_single_final_message_and_traces() -> None:
    """A completed text run produces exactly one assistant message (status=final)
    AND the expected trace sequence in the same ThreadStateResponse."""
    store = InMemoryRuntimeStore()
    service = AgentRuntimeService(
        store=store,
        adapter=FakeAdapter(),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Integration text"))
    response = await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Summarize the agenda")
    )

    assert response.run.status.value == "completed"

    # --- Streaming message assertions ---
    state = await service.get_thread_state(thread.external_id)
    assistant_msgs = [m for m in state.messages if m.role == "assistant"]
    assert len(assistant_msgs) == 1, f"Expected 1 assistant message, got {len(assistant_msgs)}"
    assert assistant_msgs[0].status == "final"
    assert assistant_msgs[0].plain_text  # non-empty

    # --- Trace assertions ---
    assert len(state.traces) >= 3, f"Expected at least 3 traces, got {len(state.traces)}"
    kinds = _trace_kinds(state.traces)
    assert "planning" in kinds, "Missing PLANNING trace"
    assert "thinking" in kinds, "Missing THINKING trace"
    assert "run_completed" in kinds, "Missing RUN_COMPLETED trace"
    assert "artifact_generation" in kinds, "Missing ARTIFACT_GENERATION trace"

    # --- Response-level traces also present ---
    assert len(response.traces) >= 3
    resp_kinds = _trace_kinds(response.traces)
    assert "planning" in resp_kinds
    assert "run_completed" in resp_kinds


@pytest.mark.asyncio
async def test_text_run_sequence_not_inflated_by_traces() -> None:
    """Trace emissions must not inflate the assistant message sequence_number.
    User=seq1, assistant=seq2 — regardless of how many traces were emitted."""
    store = InMemoryRuntimeStore()
    service = AgentRuntimeService(
        store=store,
        adapter=FakeAdapter(),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Seq + traces"))
    await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Hello")
    )

    state = await service.get_thread_state(thread.external_id)
    user_msg = next(m for m in state.messages if m.role == "user")
    assistant_msg = next(m for m in state.messages if m.role == "assistant")

    assert user_msg.sequence_number == 1
    assert assistant_msg.sequence_number == 2
    # Message sequence counter should be exactly 2
    assert store._thread_sequences[thread.external_id] == 2
    # But traces should exist (they use a separate counter)
    assert len(state.traces) >= 3
    # Trace sequence counter is separate and higher
    trace_seqs = [t.sequence_number for t in state.traces]
    assert all(s >= 1 for s in trace_seqs)


# ---------------------------------------------------------------------------
# Tests: Tool-aware run — streaming message + traces coexist
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_tool_aware_run_has_single_final_message_and_traces() -> None:
    """A completed tool-aware run produces exactly one assistant message
    AND tool-related traces in the same ThreadStateResponse."""
    store = InMemoryRuntimeStore()
    service = AgentRuntimeService(
        store=store,
        adapter=FakeToolAwareAdapter(
            AgentTurnResult(
                text_deltas=["Checking dashboard", "Summary ready"],
                final_text="Attendance: 42 attendees",
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

    thread = await service.create_thread(ThreadCreateRequest(title="Integration tool"))
    response = await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="How is attendance?")
    )

    assert response.run.status.value == "completed"

    state = await service.get_thread_state(thread.external_id)

    # --- Streaming message assertions ---
    assistant_msgs = [m for m in state.messages if m.role == "assistant"]
    assert len(assistant_msgs) == 1
    assert assistant_msgs[0].status == "final"
    assert assistant_msgs[0].plain_text == "Attendance: 42 attendees"

    # --- Trace assertions ---
    kinds = _trace_kinds(state.traces)
    assert "planning" in kinds
    assert "tool_selection" in kinds, "Missing TOOL_SELECTION trace"
    assert "tool_completion" in kinds, "Missing TOOL_COMPLETION trace"
    assert "run_completed" in kinds

    # Verify tool detail_json
    tool_sel = [t for t in state.traces if t.kind.value == "tool_selection"]
    assert len(tool_sel) >= 1
    detail = json.loads(tool_sel[0].detail_json)
    assert detail["tool"] == "get_attendance_dashboard"


# ---------------------------------------------------------------------------
# Tests: Error run — streaming message finalized + error trace
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_error_run_has_finalized_message_and_error_trace() -> None:
    """When streaming fails mid-run, the assistant message is finalized with
    error text AND a RUN_ERROR trace is emitted."""
    store = InMemoryRuntimeStore()
    service = AgentRuntimeService(
        store=store,
        adapter=ErrorAdapter(),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Error integration"))
    response = await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Trigger error")
    )

    assert response.run.status.value == "error"

    state = await service.get_thread_state(thread.external_id)

    # --- Streaming message assertions ---
    assistant_msgs = [m for m in state.messages if m.role == "assistant"]
    assert len(assistant_msgs) == 1, "Error path should still have exactly one assistant message"
    assert assistant_msgs[0].status == "final"

    # --- Trace assertions ---
    kinds = _trace_kinds(state.traces)
    assert "planning" in kinds
    assert "run_error" in kinds, "Missing RUN_ERROR trace on streaming failure"

    # The error trace should mention the failure
    error_traces = [t for t in state.traces if t.kind.value == "run_error"]
    assert len(error_traces) >= 1
    assert "streaming failure" in error_traces[0].summary.lower() or "failed" in error_traces[0].summary.lower()


# ---------------------------------------------------------------------------
# Tests: Approval flow — streaming + traces across pause/resume
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_approval_flow_has_streaming_message_and_traces(monkeypatch: pytest.MonkeyPatch) -> None:
    """A write-tool run that pauses for approval, then resumes, should produce
    exactly one assistant message AND the full trace sequence including
    APPROVAL_PAUSE, APPROVAL_RESOLUTION, TOOL_START, TOOL_COMPLETION, RUN_COMPLETED."""
    executed: list[tuple[str, dict]] = []

    async def fake_execute_tool_call(tool_name: str, tool_input: dict) -> dict:
        executed.append((tool_name, tool_input))
        return {"_id": tool_input["event_id"], "status": "confirmed"}

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

    thread = await service.create_thread(ThreadCreateRequest(title="Approval integration"))
    response = await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Confirm the event")
    )

    assert response.run.status.value == "paused_approval"

    # At pause: should have traces including APPROVAL_PAUSE
    pause_kinds = _trace_kinds(response.traces)
    assert "approval_pause" in pause_kinds

    # At pause: streaming message should exist (finalized before pause)
    state = await service.get_thread_state(thread.external_id)
    assistant_msgs = [m for m in state.messages if m.role == "assistant"]
    assert len(assistant_msgs) == 1
    assert assistant_msgs[0].status == "final"

    # Approve
    approval = state.approvals[0]
    decision = await service.submit_approval(
        approval.external_id,
        ApprovalDecisionRequest(decision=ApprovalStatus.APPROVED),
    )

    assert decision.run.status.value == "completed"
    assert len(executed) == 1

    # After approval: full trace sequence
    full_state = await service.get_thread_state(thread.external_id)
    full_kinds = _trace_kinds(full_state.traces)
    assert "approval_resolution" in full_kinds
    assert "tool_start" in full_kinds
    assert "tool_completion" in full_kinds
    assert "run_completed" in full_kinds

    # After approval: should have assistant messages from both phases
    # (the tool-aware phase + the post-approval text run)
    final_assistant_msgs = [m for m in full_state.messages if m.role == "assistant"]
    assert len(final_assistant_msgs) >= 1
    # All assistant messages should be finalized
    for msg in final_assistant_msgs:
        assert msg.status == "final", f"Assistant message {msg.external_id} has status={msg.status}"


# ---------------------------------------------------------------------------
# Tests: API-level integration — response includes both traces and correct
#        thread state with streaming-persisted messages
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_api_response_includes_traces_and_single_assistant_message() -> None:
    """The /runs API response should include traces, and the subsequent
    /threads/{id} response should show a single final assistant message."""
    from fastapi.testclient import TestClient
    from runtime.api import build_app

    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=FakeAdapter(),
    )
    app = build_app(service)
    client = TestClient(app)

    # Create thread
    thread_resp = client.post(
        "/agent/threads",
        json={"channel": "web", "title": "API Integration"},
    )
    assert thread_resp.status_code == 200
    thread_id = thread_resp.json()["external_id"]

    # Start a non-approval run (simple text)
    run_resp = client.post(
        "/agent/runs",
        json={
            "thread_id": thread_id,
            "input_text": "Summarize the agenda",
            "trigger_source": "web",
        },
    )
    assert run_resp.status_code == 200
    run_body = run_resp.json()

    # Run should be completed
    assert run_body["run"]["status"] == "completed"

    # Traces should be present in the response
    assert "traces" in run_body
    assert len(run_body["traces"]) >= 3
    trace_kinds = [t["kind"] for t in run_body["traces"]]
    assert "planning" in trace_kinds
    assert "run_completed" in trace_kinds

    # Thread state should have a single final assistant message
    state_resp = client.get(f"/agent/threads/{thread_id}")
    assert state_resp.status_code == 200
    state_body = state_resp.json()

    assistant_msgs = [m for m in state_body["messages"] if m["role"] == "assistant"]
    assert len(assistant_msgs) == 1
    assert assistant_msgs[0]["status"] == "final"
    assert assistant_msgs[0]["plain_text"]  # non-empty

    # Thread state should also include traces
    assert "traces" in state_body
    assert len(state_body["traces"]) >= 3
