"""
Tests for the thread-aware runtime harness (Issue #48).

Covers:
- Context assembly: second run includes prior messages; last-15 verbatim; older compressed
- Context links: appear in assembled system prompt
- Approval continuation: generates response from continued thread context, not detached prompt
- Adapter contract: accepts messages, max_turns=8
- Trace regression: all trace kinds still fire after harness refactor
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import pytest

import runtime.service as runtime_service
from runtime.anthropic_adapter import AgentTurnResult, ToolTrace
from runtime.context_assembler import (
    ThreadExecutionContext,
    RECENT_MESSAGE_COUNT,
    assemble_thread_context,
)
from runtime.contracts import (
    ApprovalDecisionRequest,
    ApprovalStatus,
    ContextLinkInput,
    MessageRecord,
    RunCreateRequest,
    ThreadCreateRequest,
    TraceStepKind,
)
from runtime.normalize import text_block
from runtime.policy import ActionClass, ApprovalPolicy, ToolAction
from runtime.service import AgentRuntimeService
from runtime.store import InMemoryRuntimeStore


# ---------------------------------------------------------------------------
# Fake adapters
# ---------------------------------------------------------------------------

class FakeAdapter:
    """Text-only adapter that records every call for assertion."""
    model = "fake-model"

    def __init__(self, chunks: list[str] | None = None) -> None:
        self.calls: list[dict[str, Any]] = []
        self._chunks = chunks or ["Response text", "Response text complete"]

    async def stream_text(
        self,
        *,
        messages: list,
        system_prompt: str | None = None,
        max_tokens: int = 900,
    ) -> AsyncIterator[str]:
        self.calls.append({"messages": messages, "system_prompt": system_prompt})
        for chunk in self._chunks:
            yield chunk


class FakeToolAwareAdapter:
    """Tool-aware adapter that records calls and returns pre-configured results."""
    model = "fake-agent-sdk"

    def __init__(self, result: AgentTurnResult | list[AgentTurnResult]) -> None:
        if isinstance(result, list):
            self._results = list(result)
        else:
            self._results = [result]
        self.calls: list[dict[str, Any]] = []

    async def run_agent(
        self,
        *,
        messages: list,
        system_prompt: str | None = None,
        max_turns: int = 8,
    ) -> AgentTurnResult:
        self.calls.append(
            {"messages": messages, "system_prompt": system_prompt, "max_turns": max_turns}
        )
        return self._results.pop(0)

    async def stream_text(
        self,
        *,
        messages: list,
        system_prompt: str | None = None,
        max_tokens: int = 900,
    ) -> AsyncIterator[str]:
        self.calls.append({"messages": messages, "system_prompt": system_prompt})
        yield "Post-approval continuation"
        yield "Post-approval continuation complete"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_message(
    *,
    external_id: str,
    thread_id: str,
    role: str,
    plain_text: str,
    sequence_number: int,
    status: str = "final",
) -> MessageRecord:
    from time import time
    now = int(time() * 1000)
    return MessageRecord(
        external_id=external_id,
        thread_external_id=thread_id,
        run_external_id="run_test",
        role=role,
        status=status,
        sequence_number=sequence_number,
        plain_text=plain_text,
        content_blocks=[text_block(plain_text)],
        created_at=now,
        updated_at=now,
    )


def _trace_kinds(traces) -> list[str]:
    return [t.kind.value if hasattr(t.kind, "value") else t.kind for t in traces]


# ---------------------------------------------------------------------------
# Context assembly unit tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_assemble_context_includes_thread_metadata() -> None:
    """Thread title and summary appear in the assembled system prompt."""
    from runtime.contracts import ThreadRecord, Channel
    from time import time
    now = int(time() * 1000)
    thread = ThreadRecord(
        external_id="t1",
        channel=Channel.WEB,
        title="Speaker Outreach Q2",
        summary="Working on Q2 speaker pipeline.",
        created_at=now,
        updated_at=now,
    )
    ctx = assemble_thread_context(
        thread=thread,
        messages=[],
        context_links=[],
        base_system_prompt="BASE",
    )
    assert "Speaker Outreach Q2" in ctx.system_prompt
    assert "Working on Q2 speaker pipeline." in ctx.system_prompt


@pytest.mark.asyncio
async def test_assemble_context_excludes_streaming_placeholders() -> None:
    """Streaming placeholder messages (status='streaming') are not included."""
    from runtime.contracts import ThreadRecord, Channel
    from time import time
    now = int(time() * 1000)
    thread = ThreadRecord(
        external_id="t1", channel=Channel.WEB, created_at=now, updated_at=now
    )
    streaming_msg = _make_message(
        external_id="m1", thread_id="t1", role="assistant",
        plain_text="partial...", sequence_number=1, status="streaming"
    )
    final_msg = _make_message(
        external_id="m2", thread_id="t1", role="user",
        plain_text="Hello", sequence_number=2, status="final"
    )
    ctx = assemble_thread_context(
        thread=thread,
        messages=[streaming_msg, final_msg],
        context_links=[],
        base_system_prompt="BASE",
    )
    # Only the final user message should appear in messages
    assert len(ctx.messages) == 1
    assert ctx.messages[0]["role"] == "user"
    assert ctx.messages[0]["content"] == "Hello"


@pytest.mark.asyncio
async def test_assemble_context_last_15_verbatim_older_compressed() -> None:
    """Only the last 15 finalized messages appear verbatim; older ones are compressed."""
    from runtime.contracts import ThreadRecord, Channel
    from time import time
    now = int(time() * 1000)
    thread = ThreadRecord(
        external_id="t1", channel=Channel.WEB, created_at=now, updated_at=now
    )
    # Create 20 messages alternating user/assistant
    messages = []
    for i in range(1, 21):
        role = "user" if i % 2 == 1 else "assistant"
        messages.append(_make_message(
            external_id=f"m{i}", thread_id="t1", role=role,
            plain_text=f"Message {i} text", sequence_number=i,
        ))

    ctx = assemble_thread_context(
        thread=thread,
        messages=messages,
        context_links=[],
        base_system_prompt="BASE",
    )

    # The naive recent_start = 20 - 15 = 5 (index 5, message 6) lands on an
    # assistant turn; the boundary fix walks back to index 4 (message 5, user).
    # So recent = messages 5-20; older = messages 1-4.
    verbatim_content = " ".join(m["content"] for m in ctx.messages)
    assert "Message 1 text" not in verbatim_content
    assert "Message 4 text" not in verbatim_content
    # Boundary user turn (msg 5) and later are verbatim
    assert "Message 5 text" in verbatim_content
    assert "Message 6 text" in verbatim_content or "Message 7 text" in verbatim_content

    # Older messages (1-4) appear compressed in the system prompt
    assert "Message 1 text" in ctx.system_prompt
    assert "Older thread context" in ctx.system_prompt


@pytest.mark.asyncio
async def test_assemble_context_with_context_links() -> None:
    """Context links appear in the assembled system prompt with entity_type and entity_id."""
    from runtime.contracts import ThreadRecord, Channel, ContextLinkRecord
    from time import time
    now = int(time() * 1000)
    thread = ThreadRecord(
        external_id="t1", channel=Channel.WEB, created_at=now, updated_at=now
    )
    links = [
        ContextLinkRecord(
            link_key="t1:event:evt_42",
            relation="subject",
            entity_type="event",
            entity_id="evt_42",
            label="Summer Hackathon",
            created_at=now,
            updated_at=now,
        )
    ]
    ctx = assemble_thread_context(
        thread=thread,
        messages=[],
        context_links=links,
        base_system_prompt="BASE",
    )
    assert "event" in ctx.system_prompt
    assert "evt_42" in ctx.system_prompt
    assert "Summer Hackathon" in ctx.system_prompt
    assert "Context Links" in ctx.system_prompt


@pytest.mark.asyncio
async def test_assemble_context_empty_links_no_malformed_section() -> None:
    """Empty context links produce no Context Links section."""
    from runtime.contracts import ThreadRecord, Channel
    from time import time
    now = int(time() * 1000)
    thread = ThreadRecord(
        external_id="t1", channel=Channel.WEB, created_at=now, updated_at=now
    )
    ctx = assemble_thread_context(
        thread=thread,
        messages=[],
        context_links=[],
        base_system_prompt="BASE",
    )
    assert "Context Links" not in ctx.system_prompt


# ---------------------------------------------------------------------------
# Thread-aware run integration tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_second_run_includes_prior_messages_in_adapter_call() -> None:
    """A second run on the same thread passes prior finalized messages to the adapter."""
    adapter = FakeAdapter()
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=adapter,
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Multi-turn test"))

    # First run
    await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="What time did we agree on?")
    )
    first_call_messages = adapter.calls[0]["messages"]

    # Second run
    await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="And the location?")
    )
    second_call_messages = adapter.calls[1]["messages"]

    # Second call should have more messages than the first (includes prior exchange)
    assert len(second_call_messages) > len(first_call_messages)
    # Prior user message should appear in context
    all_content = " ".join(m["content"] for m in second_call_messages)
    assert "What time did we agree on?" in all_content


@pytest.mark.asyncio
async def test_adapter_receives_assembled_messages_not_single_string() -> None:
    """The refactored adapter receives messages list, not a single user_prompt string."""
    adapter = FakeAdapter()
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=adapter,
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Adapter contract test"))
    await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Show me the events")
    )

    assert len(adapter.calls) == 1
    call = adapter.calls[0]
    assert "messages" in call
    assert isinstance(call["messages"], list)
    assert len(call["messages"]) >= 1
    assert all(isinstance(m, dict) and "role" in m and "content" in m for m in call["messages"])


@pytest.mark.asyncio
async def test_tool_aware_adapter_max_turns_is_8() -> None:
    """The tool-aware adapter is called with max_turns=8 (not the old default of 6)."""
    adapter = FakeToolAwareAdapter(
        AgentTurnResult(
            text_deltas=["Done"],
            final_text="Done",
        )
    )
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=adapter,
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Max turns test"))
    await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="List events")
    )

    assert len(adapter.calls) == 1
    assert adapter.calls[0]["max_turns"] == 8


@pytest.mark.asyncio
async def test_context_links_appear_in_adapter_system_prompt() -> None:
    """Threads with context links include entity info in the assembled system prompt."""
    adapter = FakeAdapter()
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=adapter,
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(
        ThreadCreateRequest(
            title="Context link test",
            context_links=[
                ContextLinkInput(
                    entity_type="event",
                    entity_id="evt_99",
                    label="Winter Gala",
                )
            ],
        )
    )
    await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="What's the status?")
    )

    assert len(adapter.calls) == 1
    system_prompt = adapter.calls[0]["system_prompt"] or ""
    assert "evt_99" in system_prompt
    assert "Winter Gala" in system_prompt


# ---------------------------------------------------------------------------
# Approval continuation tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_approved_action_generates_response_from_thread_context(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """After approval, the follow-up response is generated from continued thread context."""
    executed: list[tuple[str, dict]] = []

    async def fake_execute(tool_name: str, tool_input: dict) -> dict:
        executed.append((tool_name, tool_input))
        return {"_id": tool_input["event_id"], "status": "confirmed"}

    monkeypatch.setattr(runtime_service, "execute_tool_call", fake_execute)

    adapter = FakeToolAwareAdapter(
        AgentTurnResult(
            tool_traces=[
                ToolTrace(
                    name="update_event_safe",
                    tool_input={"event_id": "evt_1", "status": "confirmed"},
                    tool_use_id="tool_1",
                )
            ],
            blocked_action=ToolAction(
                name="update_event_safe",
                action_class=ActionClass.WRITE,
                payload={"tool_input": {"event_id": "evt_1", "status": "confirmed"}},
            ),
        )
    )
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=adapter,
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Approval continuation"))
    await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Confirm the event")
    )

    state = await service.get_thread_state(thread.external_id)
    approval = state.approvals[0]

    decision = await service.submit_approval(
        approval.external_id,
        ApprovalDecisionRequest(decision=ApprovalStatus.APPROVED),
    )

    assert decision.run.status.value == "completed"

    # The post-approval stream_text call must receive messages (thread context),
    # not a detached synthetic prompt string.
    stream_calls = [c for c in adapter.calls if "messages" in c and isinstance(c["messages"], list)]
    assert len(stream_calls) >= 1
    post_approval_call = stream_calls[-1]
    assert isinstance(post_approval_call["messages"], list)
    assert len(post_approval_call["messages"]) >= 1

    # System prompt should contain the post-approval instruction
    system_prompt = post_approval_call.get("system_prompt") or ""
    assert "approved action has already been executed" in system_prompt.lower() or "Continue the same conversation" in system_prompt


@pytest.mark.asyncio
async def test_post_approval_messages_include_tool_result_from_thread(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Post-approval messages come from thread history (which includes the tool message)."""
    async def fake_execute(tool_name: str, tool_input: dict) -> dict:
        return {"_id": tool_input["event_id"], "updated": True}

    monkeypatch.setattr(runtime_service, "execute_tool_call", fake_execute)

    adapter = FakeToolAwareAdapter(
        AgentTurnResult(
            tool_traces=[
                ToolTrace(
                    name="update_event_safe",
                    tool_input={"event_id": "evt_2", "status": "confirmed"},
                    tool_use_id="t1",
                )
            ],
            blocked_action=ToolAction(
                name="update_event_safe",
                action_class=ActionClass.WRITE,
                payload={"tool_input": {"event_id": "evt_2", "status": "confirmed"}},
            ),
        )
    )
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=adapter,
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Tool result context"))
    await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Update event status")
    )

    state = await service.get_thread_state(thread.external_id)
    approval = state.approvals[0]

    await service.submit_approval(
        approval.external_id,
        ApprovalDecisionRequest(decision=ApprovalStatus.APPROVED),
    )

    # After approval, the thread should contain a tool message
    final_state = await service.get_thread_state(thread.external_id)
    tool_msgs = [m for m in final_state.messages if m.role == "tool"]
    assert len(tool_msgs) >= 1

    tool_msg_plain = tool_msgs[-1].plain_text or ""

    # The post-approval continuation passed to the adapter should include the
    # tool result from thread history in the assembled messages/system prompt.
    stream_calls = [c for c in adapter.calls if "messages" in c]
    assert len(stream_calls) >= 1

    def _call_text(call: dict[str, Any]) -> str:
        parts = []
        if "messages" in call:
            parts.append(json.dumps(call["messages"], sort_keys=True))
        if "system_prompt" in call:
            parts.append(str(call["system_prompt"]))
        return "\n".join(parts)

    call_texts = [_call_text(call) for call in stream_calls]
    assert any(
        (
            tool_msg_plain in text
            or "evt_2" in text
            or "updated" in text
        )
        for text in call_texts
    ), "Expected post-approval continuation payload to include tool result content from the thread"


@pytest.mark.asyncio
async def test_rejected_approval_still_finalizes_without_tool_execution() -> None:
    """Rejected approvals still finalize cleanly — no change in behavior."""
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=FakeAdapter(),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Reject test"))
    await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Delete all events")
    )

    state = await service.get_thread_state(thread.external_id)
    approval = state.approvals[0]

    decision = await service.submit_approval(
        approval.external_id,
        ApprovalDecisionRequest(decision=ApprovalStatus.REJECTED),
    )

    assert decision.approval.status.value == "rejected"
    assert decision.run.status.value == "completed"


# ---------------------------------------------------------------------------
# Long-thread compression test
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_long_thread_compresses_older_messages_into_system_prompt() -> None:
    """A thread with >15 messages retains recent turns verbatim and compresses older ones."""
    adapter = FakeAdapter()
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=adapter,
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Long thread"))

    # Run 10 pairs of user/assistant exchanges (20 total messages + user msg for last run)
    for i in range(1, 11):
        service._adapter = FakeAdapter(
            [f"Msg{i} answer", f"Msg{i} answer complete"]
        )
        await service.start_run(
            RunCreateRequest(thread_id=thread.external_id, input_text=f"Question {i}")
        )

    # Now start one more run and capture what context the adapter receives
    capture_adapter = FakeAdapter(["Final answer", "Final answer complete"])
    service._adapter = capture_adapter
    await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="What is the recap?")
    )

    call = capture_adapter.calls[0]
    system_prompt = call["system_prompt"] or ""
    messages = call["messages"]

    # Older content should be in system prompt as compressed history
    assert "Older thread context" in system_prompt

    # Recent messages (verbatim) should be in messages list
    assert len(messages) <= RECENT_MESSAGE_COUNT + 2  # at most RECENT_COUNT + possible merges


# ---------------------------------------------------------------------------
# Trace regression tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_traces_still_fire_after_harness_refactor() -> None:
    """All core trace kinds still emit after the harness refactor."""
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=FakeAdapter(),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Trace regression"))
    response = await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Summarize the agenda")
    )

    kinds = _trace_kinds(response.traces)
    assert "planning" in kinds
    assert "thinking" in kinds
    assert "artifact_generation" in kinds
    assert "run_completed" in kinds
    assert len(response.traces) > 0


@pytest.mark.asyncio
async def test_trace_step_events_emitted_after_harness_refactor() -> None:
    """trace.step stream events still fire after the refactor."""
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=FakeAdapter(),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Stream events"))
    response = await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Hello")
    )

    trace_events = [e for e in response.events if e.event == "trace.step"]
    assert len(trace_events) >= 1
    for event in trace_events:
        assert "kind" in event.data
        assert "summary" in event.data


@pytest.mark.asyncio
async def test_tool_aware_traces_still_fire_after_harness_refactor() -> None:
    """Tool selection and completion traces still fire for tool-aware runs."""
    service = AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=FakeToolAwareAdapter(
            AgentTurnResult(
                text_deltas=["Result"],
                final_text="Result complete",
                tool_traces=[
                    ToolTrace(
                        name="get_attendance_dashboard",
                        tool_input={},
                        tool_use_id="t1",
                        result={"totals": {}},
                    )
                ],
            )
        ),
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Tool traces"))
    response = await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="How is attendance?")
    )

    kinds = _trace_kinds(response.traces)
    assert "planning" in kinds
    assert "tool_selection" in kinds
    assert "tool_completion" in kinds
    assert "run_completed" in kinds
