"""
Tests for the normalized reasoning-trace system (Issue #20).

Success / Failure States
========================

SUCCESS states:
  - Every completed run emits at least a PLANNING trace and a RUN_COMPLETED trace.
  - Tool-aware runs emit TOOL_SELECTION and TOOL_COMPLETION/TOOL_FAILURE traces
    for each tool invocation.
  - Approval-paused runs emit an APPROVAL_PAUSE trace with status="waiting".
  - After approval resolution, an APPROVAL_RESOLUTION trace is emitted.
  - Guardrail retries produce a GUARDRAIL_RETRY trace.
  - Traces are returned in RunWithEventsResponse.traces and ThreadStateResponse.traces.
  - Traces are ordered by (run_id, sequence_number) ascending.
  - Each trace has a unique external_id and monotonically increasing sequence_number per run.
  - Trace detail_json (when present) is valid JSON.
  - No trace contains raw provider payloads (no "anthropic", no "provider_event").

FAILURE states:
  - A run that errors emits a RUN_ERROR trace.
  - Missing or out-of-order traces indicate a regression in the emit pipeline.
  - Traces with invalid JSON in detail_json indicate serialization bugs.
  - If a completed run has zero traces, the trace pipeline is broken.
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
# Fake adapters (reused from test_runtime_service.py pattern)
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
# Helper
# ---------------------------------------------------------------------------

def _trace_kinds(traces) -> list[str]:
    """Extract the kind values from a list of TraceStepRecord objects."""
    return [t.kind.value if hasattr(t.kind, "value") else t.kind for t in traces]


def _assert_valid_detail_json(traces) -> None:
    """Assert that every trace with detail_json has valid JSON content."""
    for t in traces:
        if t.detail_json:
            parsed = json.loads(t.detail_json)
            assert isinstance(parsed, dict), f"detail_json should be a dict, got {type(parsed)}"


def _assert_no_provider_leak(traces) -> None:
    """Assert that no trace leaks raw provider payloads."""
    for t in traces:
        combined = t.summary + (t.detail_json or "")
        assert "provider_event" not in combined, f"Trace {t.external_id} leaks provider_event"


def _assert_monotonic_sequences(traces) -> None:
    """Assert that sequence numbers are monotonically increasing per run."""
    by_run: dict[str, list[int]] = {}
    for t in traces:
        by_run.setdefault(t.run_external_id, []).append(t.sequence_number)
    for run_id, seqs in by_run.items():
        assert seqs == sorted(seqs), f"Traces for run {run_id} are not in order: {seqs}"
        assert len(seqs) == len(set(seqs)), f"Duplicate sequence numbers in run {run_id}: {seqs}"


# ---------------------------------------------------------------------------
# Tests: Basic text run traces
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_simple_text_run_emits_planning_and_completed_traces() -> None:
    """SUCCESS: A simple text run produces PLANNING, THINKING, ARTIFACT_GENERATION, and RUN_COMPLETED traces."""
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=FakeAdapter(),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Trace test"))
    response = await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Summarize the agenda")
    )

    assert response.run.status.value == "completed"

    traces = response.traces
    assert len(traces) >= 3, f"Expected at least 3 traces, got {len(traces)}"

    kinds = _trace_kinds(traces)
    assert "planning" in kinds, "Missing PLANNING trace"
    assert "run_completed" in kinds, "Missing RUN_COMPLETED trace"
    assert "artifact_generation" in kinds, "Missing ARTIFACT_GENERATION trace"

    _assert_monotonic_sequences(traces)
    _assert_valid_detail_json(traces)
    _assert_no_provider_leak(traces)


@pytest.mark.asyncio
async def test_traces_appear_in_thread_state() -> None:
    """SUCCESS: Traces are persisted and returned in ThreadStateResponse."""
    store = InMemoryRuntimeStore()
    service = AgentRuntimeService(
        store=store,
        adapter=FakeAdapter(),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="State test"))
    await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Hello")
    )

    state = await service.get_thread_state(thread.external_id)
    assert len(state.traces) >= 3, f"Expected traces in thread state, got {len(state.traces)}"

    kinds = _trace_kinds(state.traces)
    assert "planning" in kinds
    assert "run_completed" in kinds


@pytest.mark.asyncio
async def test_trace_unique_external_ids() -> None:
    """SUCCESS: Every trace has a unique external_id."""
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=FakeAdapter(),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Unique ID test"))
    response = await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Test uniqueness")
    )

    ids = [t.external_id for t in response.traces]
    assert len(ids) == len(set(ids)), f"Duplicate trace IDs found: {ids}"


# ---------------------------------------------------------------------------
# Tests: Tool-aware run traces
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_tool_aware_read_run_emits_tool_traces() -> None:
    """SUCCESS: A tool-aware read run emits TOOL_SELECTION and TOOL_COMPLETION traces."""
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=FakeToolAwareAdapter(
            AgentTurnResult(
                text_deltas=["Checking dashboard", "Summary ready"],
                final_text="Summary ready",
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

    thread = await service.create_thread(ThreadCreateRequest(title="Tool trace test"))
    response = await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="How is attendance?")
    )

    assert response.run.status.value == "completed"

    kinds = _trace_kinds(response.traces)
    assert "planning" in kinds
    assert "tool_selection" in kinds, "Missing TOOL_SELECTION trace"
    assert "tool_completion" in kinds, "Missing TOOL_COMPLETION trace"
    assert "run_completed" in kinds

    # Verify tool detail_json contains tool name
    tool_traces = [t for t in response.traces if t.kind.value == "tool_selection"]
    assert len(tool_traces) >= 1
    detail = json.loads(tool_traces[0].detail_json)
    assert detail["tool"] == "get_attendance_dashboard"

    _assert_valid_detail_json(response.traces)
    _assert_no_provider_leak(response.traces)


@pytest.mark.asyncio
async def test_tool_failure_emits_tool_failure_trace() -> None:
    """SUCCESS: A failed tool produces a TOOL_FAILURE trace."""
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=FakeToolAwareAdapter(
            AgentTurnResult(
                text_deltas=["Error occurred"],
                final_text="Tool failed.",
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
        ),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Failure trace test"))
    response = await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="What are the latest stats?")
    )

    kinds = _trace_kinds(response.traces)
    assert "tool_failure" in kinds, "Missing TOOL_FAILURE trace"

    failure_traces = [t for t in response.traces if t.kind.value == "tool_failure"]
    assert "list_events" in failure_traces[0].summary


# ---------------------------------------------------------------------------
# Tests: Approval flow traces
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_approval_pause_emits_trace() -> None:
    """SUCCESS: A run paused for approval emits an APPROVAL_PAUSE trace with status='waiting'."""
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=FakeAdapter(),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Approval trace test"))
    response = await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Send outreach email to speakers")
    )

    assert response.run.status.value == "paused_approval"

    kinds = _trace_kinds(response.traces)
    assert "planning" in kinds
    assert "approval_pause" in kinds, "Missing APPROVAL_PAUSE trace"

    pause_traces = [t for t in response.traces if t.kind.value == "approval_pause"]
    assert pause_traces[0].status == "waiting"

    _assert_valid_detail_json(response.traces)


@pytest.mark.asyncio
async def test_approval_resolution_emits_trace() -> None:
    """SUCCESS: Resolving an approval emits APPROVAL_RESOLUTION and RUN_COMPLETED traces."""
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=FakeAdapter(),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Resolution trace test"))
    response = await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Delete this event")
    )

    state = await service.get_thread_state(thread.external_id)
    approval = state.approvals[0]

    decision = await service.submit_approval(
        approval.external_id,
        ApprovalDecisionRequest(decision=ApprovalStatus.REJECTED),
    )

    assert decision.run.status.value == "completed"

    # Get all traces after resolution
    full_state = await service.get_thread_state(thread.external_id)
    kinds = _trace_kinds(full_state.traces)
    assert "approval_resolution" in kinds, "Missing APPROVAL_RESOLUTION trace"
    assert "run_completed" in kinds, "Missing RUN_COMPLETED trace"

    _assert_valid_detail_json(full_state.traces)


@pytest.mark.asyncio
async def test_approved_write_tool_emits_tool_start_and_completion_traces(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """SUCCESS: Approving a write tool emits TOOL_START, TOOL_COMPLETION, and APPROVAL_RESOLUTION traces."""
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

    thread = await service.create_thread(ThreadCreateRequest(title="Write tool trace test"))
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

    assert decision.run.status.value == "completed"
    assert len(executed) == 1

    full_state = await service.get_thread_state(thread.external_id)
    kinds = _trace_kinds(full_state.traces)
    assert "approval_resolution" in kinds
    assert "tool_start" in kinds, "Missing TOOL_START trace after approval"
    assert "tool_completion" in kinds, "Missing TOOL_COMPLETION trace after approval"
    assert "run_completed" in kinds

    _assert_monotonic_sequences(full_state.traces)
    _assert_valid_detail_json(full_state.traces)


# ---------------------------------------------------------------------------
# Tests: Guardrail retry traces
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_guardrail_retry_emits_trace() -> None:
    """SUCCESS: A guardrail retry produces a GUARDRAIL_RETRY trace."""
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

    thread = await service.create_thread(ThreadCreateRequest(title="Retry trace test"))
    response = await service.start_run(
        RunCreateRequest(
            thread_id=thread.external_id,
            input_text="What were the latest event stats with actual attendance?",
        )
    )

    assert response.run.status.value == "completed"

    kinds = _trace_kinds(response.traces)
    assert "guardrail_retry" in kinds, "Missing GUARDRAIL_RETRY trace"
    assert "tool_selection" in kinds, "Missing TOOL_SELECTION trace after retry"

    _assert_valid_detail_json(response.traces)


# ---------------------------------------------------------------------------
# Tests: Trace stream events
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_trace_steps_appear_as_stream_events() -> None:
    """SUCCESS: Each trace step is also emitted as a 'trace.step' stream event."""
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=FakeAdapter(),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Stream event test"))
    response = await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Hello world")
    )

    trace_events = [e for e in response.events if e.event == "trace.step"]
    assert len(trace_events) >= 3, f"Expected at least 3 trace.step events, got {len(trace_events)}"

    # Each trace.step event should have kind, summary, and sequence
    for event in trace_events:
        assert "kind" in event.data
        assert "summary" in event.data
        assert "sequence" in event.data


@pytest.mark.asyncio
async def test_trace_step_events_do_not_leak_provider_data() -> None:
    """SUCCESS: trace.step stream events contain no raw provider payloads."""
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=FakeAdapter(),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="No leak test"))
    response = await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Test no leak")
    )

    for event in response.events:
        if event.event == "trace.step":
            serialized = json.dumps(event.data)
            assert "provider_event" not in serialized
            assert "anthropic" not in serialized.lower()


# ---------------------------------------------------------------------------
# Tests: Failure states
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_zero_traces_is_failure_state() -> None:
    """FAILURE STATE: A completed run with zero traces indicates a broken trace pipeline.
    This test verifies the pipeline is NOT broken by asserting traces > 0."""
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=FakeAdapter(),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Zero trace check"))
    response = await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Simple request")
    )

    assert response.run.status.value == "completed"
    assert len(response.traces) > 0, "FAILURE: Completed run has zero traces — trace pipeline is broken"


@pytest.mark.asyncio
async def test_trace_sequence_ordering_invariant() -> None:
    """FAILURE STATE: Out-of-order traces indicate a regression in the emit pipeline."""
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=FakeToolAwareAdapter(
            AgentTurnResult(
                text_deltas=["Result"],
                final_text="Done",
                tool_traces=[
                    ToolTrace(name="list_events", tool_input={"limit": 5}, tool_use_id="t1", result=[{"_id": "e1"}]),
                    ToolTrace(name="get_event_attendance", tool_input={"event_id": "e1"}, tool_use_id="t2", result={"attendees": []}),
                ],
            )
        ),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Ordering test"))
    response = await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Check attendance")
    )

    sequences = [t.sequence_number for t in response.traces]
    assert sequences == sorted(sequences), f"FAILURE: Traces out of order: {sequences}"
    assert len(sequences) == len(set(sequences)), f"FAILURE: Duplicate sequence numbers: {sequences}"


@pytest.mark.asyncio
async def test_invalid_detail_json_is_failure_state() -> None:
    """FAILURE STATE: Traces with invalid detail_json indicate serialization bugs.
    This test verifies all detail_json values are valid JSON."""
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=FakeToolAwareAdapter(
            AgentTurnResult(
                text_deltas=["Done"],
                final_text="Complete",
                tool_traces=[
                    ToolTrace(
                        name="get_attendance_dashboard",
                        tool_input={"filter": "recent"},
                        tool_use_id="t1",
                        result={"total": 100},
                    )
                ],
            )
        ),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="JSON validity test"))
    response = await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Dashboard stats")
    )

    for trace in response.traces:
        if trace.detail_json is not None:
            try:
                parsed = json.loads(trace.detail_json)
                assert isinstance(parsed, dict), f"Expected dict, got {type(parsed)}"
            except json.JSONDecodeError as exc:
                pytest.fail(f"FAILURE: Invalid detail_json in trace {trace.external_id}: {exc}")


# ---------------------------------------------------------------------------
# Tests: TraceStepKind enum completeness
# ---------------------------------------------------------------------------

def test_trace_step_kind_enum_values() -> None:
    """Verify all expected trace kinds exist in the enum."""
    expected = {
        "planning",
        "tool_selection",
        "tool_start",
        "tool_completion",
        "tool_failure",
        "approval_pause",
        "approval_resolution",
        "artifact_generation",
        "thinking",
        "guardrail_retry",
        "run_completed",
        "run_error",
    }
    actual = {kind.value for kind in TraceStepKind}
    assert expected == actual, f"Mismatch: missing={expected - actual}, extra={actual - expected}"


# ---------------------------------------------------------------------------
# Tests: Store-level trace operations
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_store_append_and_list_traces() -> None:
    """Verify InMemoryRuntimeStore trace operations work correctly."""
    from runtime.normalize import make_trace_step

    store = InMemoryRuntimeStore()

    trace1 = make_trace_step(
        external_id="trace_1",
        thread_id="thread_1",
        run_id="run_1",
        kind=TraceStepKind.PLANNING,
        sequence_number=1,
        summary="Planning step",
    )
    trace2 = make_trace_step(
        external_id="trace_2",
        thread_id="thread_1",
        run_id="run_1",
        kind=TraceStepKind.THINKING,
        sequence_number=2,
        summary="Thinking step",
    )
    trace3 = make_trace_step(
        external_id="trace_3",
        thread_id="thread_1",
        run_id="run_2",
        kind=TraceStepKind.PLANNING,
        sequence_number=1,
        summary="Another run planning",
    )

    await store.append_trace(trace1)
    await store.append_trace(trace2)
    await store.append_trace(trace3)

    # List by run
    run1_traces = await store.list_traces_for_run("run_1")
    assert len(run1_traces) == 2
    assert run1_traces[0].external_id == "trace_1"
    assert run1_traces[1].external_id == "trace_2"

    # List by thread
    thread_traces = await store.list_traces_for_thread("thread_1")
    assert len(thread_traces) == 3

    # Sequence counter
    seq = await store.next_trace_sequence("run_new")
    assert seq == 1
    seq2 = await store.next_trace_sequence("run_new")
    assert seq2 == 2
