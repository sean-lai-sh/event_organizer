"""Runtime-level tests for OnceHub integration (issue #52).

Covers:
- `find_oncehub_slots` executes without approval (read-only).
- `book_oncehub_room` pauses for approval (write-class).
- Approval title for OnceHub bookings is human-readable (not raw fields).
- On approved booking that returns `event_id`, an `event` context link is
  attached to the thread.
- On successful `find_oncehub_slots`, a table artifact is generated from
  the returned slots.
"""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

import runtime.service as runtime_service
from runtime.anthropic_adapter import AgentTurnResult, ToolTrace
from runtime.contracts import (
    ApprovalDecisionRequest,
    ApprovalStatus,
    RunCreateRequest,
    ThreadCreateRequest,
)
from runtime.policy import ActionClass, ApprovalPolicy, ToolAction
from runtime.service import _make_approval_title
from runtime.store import InMemoryRuntimeStore


# Reuse the tool-aware fake from the harness test by importing lazily.
from tests.test_runtime_harness import FakeToolAwareAdapter


def _approval_epoch_ms() -> int:
    tz = ZoneInfo("America/New_York")
    return int(datetime(2026, 5, 15, 18, 0, tzinfo=tz).timestamp() * 1000)


# ── Approval title formatting ──────────────────────────────────────────

def test_book_oncehub_room_approval_title_has_readable_slot_label() -> None:
    action = ToolAction(
        name="book_oncehub_room",
        action_class=ActionClass.WRITE,
        payload={
            "tool_input": {
                "slot_start_epoch_ms": _approval_epoch_ms(),
                "duration_minutes": 90,
                "title": "Speaker Panel",
                "num_attendees": 30,
            }
        },
    )
    title = _make_approval_title(action)
    assert "Book Leslie eLab Lean/Launchpad: Speaker Panel" in title
    assert "6:00 PM" in title  # formatted slot label, not epoch ms


# ── Approval gating ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_find_oncehub_slots_executes_without_approval(monkeypatch: pytest.MonkeyPatch) -> None:
    tz = ZoneInfo("America/New_York")
    epoch = int(datetime(2026, 5, 15, 10, 0, tzinfo=tz).timestamp() * 1000)
    tool_result = {
        "room": {"label": "Lean/Launchpad", "page_url": "u", "link_name": "Lean-Launchpad"},
        "query": {"start_date": "2026-05-10", "end_date": "2026-05-20", "duration_minutes": 90},
        "slots": [
            {
                "date": "2026-05-15",
                "day_of_week": "Friday",
                "start_time": "10:00 AM",
                "end_time": "11:30 AM",
                "duration_minutes": 90,
                "slot_start_epoch_ms": epoch,
            }
        ],
    }

    adapter = FakeToolAwareAdapter(
        AgentTurnResult(
            text_deltas=["Here are options"],
            final_text="Here are options",
            tool_traces=[
                ToolTrace(
                    name="find_oncehub_slots",
                    tool_input={"start_date": "2026-05-10", "end_date": "2026-05-20", "duration_minutes": 90},
                    tool_use_id="t1",
                    result=tool_result,
                )
            ],
        )
    )
    service = runtime_service.AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=adapter,
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Find slots"))
    response = await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="When is the room free next week?")
    )
    assert response.run.status.value == "completed"

    # A table artifact should be attached from the slots.
    state = await service.get_thread_state(thread.external_id)
    table_artifacts = [a for a in state.artifacts if a.kind.value == "table"]
    assert len(table_artifacts) == 1
    assert "Lean/Launchpad" in (table_artifacts[0].title or "")


@pytest.mark.asyncio
async def test_book_oncehub_room_pauses_for_approval() -> None:
    tool_input = {
        "slot_start_epoch_ms": _approval_epoch_ms(),
        "duration_minutes": 90,
        "title": "Speaker Panel",
        "num_attendees": 30,
    }
    adapter = FakeToolAwareAdapter(
        AgentTurnResult(
            tool_traces=[
                ToolTrace(name="book_oncehub_room", tool_input=tool_input, tool_use_id="t1")
            ],
            blocked_action=ToolAction(
                name="book_oncehub_room",
                action_class=ActionClass.WRITE,
                payload={"tool_input": tool_input},
            ),
        )
    )
    service = runtime_service.AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=adapter,
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Book room"))
    await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Book the room for Friday")
    )

    state = await service.get_thread_state(thread.external_id)
    assert len(state.approvals) == 1
    approval = state.approvals[0]
    assert approval.status == ApprovalStatus.PENDING
    assert approval.action_type == "write"
    assert "Lean/Launchpad" in approval.title


# ── Approved booking attaches an event context link ────────────────────

@pytest.mark.asyncio
async def test_approved_booking_attaches_event_context_link(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_execute(tool_name: str, tool_input: dict):
        assert tool_name == "book_oncehub_room"
        return {
            "event_id": "evt_new_99",
            "event_created": True,
            "booking_reference": "bk_99",
            "booking_status": "confirmed",
            "room_label": "Lean/Launchpad",
            "booked_date": "2026-05-15",
            "title": tool_input.get("title", "Event"),
        }

    monkeypatch.setattr(runtime_service, "execute_tool_call", fake_execute)

    tool_input = {
        "slot_start_epoch_ms": _approval_epoch_ms(),
        "duration_minutes": 90,
        "title": "Speaker Panel",
        "num_attendees": 30,
    }
    adapter = FakeToolAwareAdapter(
        AgentTurnResult(
            tool_traces=[
                ToolTrace(name="book_oncehub_room", tool_input=tool_input, tool_use_id="t1")
            ],
            blocked_action=ToolAction(
                name="book_oncehub_room",
                action_class=ActionClass.WRITE,
                payload={"tool_input": tool_input},
            ),
        )
    )
    service = runtime_service.AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=adapter,
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Book room with link"))
    await service.start_run(
        RunCreateRequest(thread_id=thread.external_id, input_text="Book the room")
    )

    state = await service.get_thread_state(thread.external_id)
    approval = state.approvals[0]
    decision = await service.submit_approval(
        approval.external_id,
        ApprovalDecisionRequest(decision=ApprovalStatus.APPROVED),
    )
    assert decision.approval.status == ApprovalStatus.APPROVED
    assert decision.run.status.value == "completed"

    final_state = await service.get_thread_state(thread.external_id)
    event_links = [
        link for link in final_state.context_links
        if link.entity_type == "event" and link.entity_id == "evt_new_99"
    ]
    assert len(event_links) == 1
    assert event_links[0].relation == "subject"


@pytest.mark.asyncio
async def test_rejected_booking_does_not_execute_tool(monkeypatch: pytest.MonkeyPatch) -> None:
    called = {"count": 0}

    async def fake_execute(*_args, **_kwargs):
        called["count"] += 1
        return {}

    monkeypatch.setattr(runtime_service, "execute_tool_call", fake_execute)

    tool_input = {
        "slot_start_epoch_ms": _approval_epoch_ms(),
        "duration_minutes": 90,
        "title": "Social",
        "num_attendees": 25,
    }
    adapter = FakeToolAwareAdapter(
        AgentTurnResult(
            tool_traces=[ToolTrace(name="book_oncehub_room", tool_input=tool_input, tool_use_id="t1")],
            blocked_action=ToolAction(
                name="book_oncehub_room",
                action_class=ActionClass.WRITE,
                payload={"tool_input": tool_input},
            ),
        )
    )
    service = runtime_service.AgentRuntimeService(
        store=InMemoryRuntimeStore(),
        adapter=adapter,
        policy=ApprovalPolicy(),
    )

    thread = await service.create_thread(ThreadCreateRequest(title="Reject booking"))
    await service.start_run(RunCreateRequest(thread_id=thread.external_id, input_text="book"))
    state = await service.get_thread_state(thread.external_id)
    decision = await service.submit_approval(
        state.approvals[0].external_id,
        ApprovalDecisionRequest(decision=ApprovalStatus.REJECTED),
    )

    assert decision.approval.status == ApprovalStatus.REJECTED
    assert called["count"] == 0
