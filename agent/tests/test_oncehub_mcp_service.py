"""MCP tool tests for the OnceHub integration (issue #52).

These run the three MCP tools (`find_oncehub_slots`, `book_oncehub_room`,
`get_event_room_booking`) with fake OnceHub + Convex clients to cover the
payload-shaping, event-creation, and booking-receipt persistence logic.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest

from apps.mcp import service as mcp_service
from core.clients.oncehub import OnceHubBookingReceipt, OnceHubRoom, OnceHubSlot


class FakeOnceHubClient:
    def __init__(self, state: dict) -> None:
        self.state = state
        self._tz_name = "America/New_York"
        self.tz_name = self._tz_name

    async def __aenter__(self) -> "FakeOnceHubClient":
        return self

    async def __aexit__(self, *_args) -> None:
        return None

    def format_slot_labels(
        self,
        *,
        slot_start_epoch_ms: int,
        duration_minutes: int,
    ) -> dict[str, str]:
        tz = ZoneInfo(self._tz_name)
        local_start = datetime.fromtimestamp(slot_start_epoch_ms / 1000, tz=timezone.utc).astimezone(tz)
        local_end = local_start + timedelta(minutes=duration_minutes)
        return {
            "booked_date": local_start.date().isoformat(),
            "booked_time": local_start.strftime("%-I:%M %p"),
            "booked_end_time": local_end.strftime("%-I:%M %p"),
        }

    async def resolve_room(self) -> OnceHubRoom:
        return OnceHubRoom(
            room_id="Lean-Launchpad",
            label="Lean/Launchpad",
            page_url="https://go.oncehub.com/NYULeslie/Lean-Launchpad",
            link_name="Lean-Launchpad",
        )

    async def list_slots(
        self,
        *,
        start_date: str,
        end_date: str,
        duration_minutes: int,
        preferred_time_window: str | None = None,
    ) -> list[OnceHubSlot]:
        self.state["list_calls"].append(
            {
                "start_date": start_date,
                "end_date": end_date,
                "duration_minutes": duration_minutes,
                "preferred_time_window": preferred_time_window,
            }
        )
        return self.state.get("slots", [])

    async def submit_booking(self, **kwargs) -> OnceHubBookingReceipt:
        self.state["booking_calls"].append(kwargs)
        return self.state.get(
            "booking_receipt",
            OnceHubBookingReceipt(status="confirmed", booking_reference="bk_1", raw={"ok": True}),
        )


class FakeConvexClient:
    def __init__(self, state: dict) -> None:
        self.state = state

    async def __aenter__(self) -> "FakeConvexClient":
        return self

    async def __aexit__(self, *_args) -> None:
        return None

    async def create_event(self, event: dict) -> str:
        self.state["create_event_calls"].append(event)
        return self.state.get("create_event_result", "evt_new_42")

    async def upsert_event_room_booking(self, **kwargs) -> str:
        self.state["upsert_booking_calls"].append(kwargs)
        return self.state.get("upsert_booking_result", "booking_1")

    async def apply_inbound_milestones(
        self,
        event_id: str,
        *,
        speaker_confirmed: bool | None = None,
        room_confirmed: bool | None = None,
    ) -> None:
        self.state["milestones_calls"].append(
            {
                "event_id": event_id,
                "speaker_confirmed": speaker_confirmed,
                "room_confirmed": room_confirmed,
            }
        )

    async def get_event_room_booking(self, event_id: str) -> dict | None:
        self.state["get_booking_calls"].append(event_id)
        return self.state.get("get_booking_result")


def _install_fakes(monkeypatch: pytest.MonkeyPatch) -> dict:
    state: dict = {
        "list_calls": [],
        "booking_calls": [],
        "create_event_calls": [],
        "upsert_booking_calls": [],
        "milestones_calls": [],
        "get_booking_calls": [],
    }
    monkeypatch.setattr(mcp_service, "OnceHubClient", lambda: FakeOnceHubClient(state))
    monkeypatch.setattr(mcp_service, "ConvexClient", lambda: FakeConvexClient(state))
    return state


def _slot(start_epoch_ms: int, duration_minutes: int = 90) -> OnceHubSlot:
    tz = ZoneInfo("America/New_York")
    start = datetime.fromtimestamp(start_epoch_ms / 1000, tz=timezone.utc).astimezone(tz)
    end = datetime.fromtimestamp(
        (start_epoch_ms + duration_minutes * 60 * 1000) / 1000, tz=timezone.utc
    ).astimezone(tz)
    return OnceHubSlot(
        start_epoch_ms=start_epoch_ms,
        end_epoch_ms=start_epoch_ms + duration_minutes * 60 * 1000,
        start_iso=start.isoformat(),
        end_iso=end.isoformat(),
        duration_minutes=duration_minutes,
        display_date=start.date().isoformat(),
        display_day_of_week=start.strftime("%A"),
        display_time=start.strftime("%-I:%M %p"),
        display_end_time=end.strftime("%-I:%M %p"),
        room_label="Lean/Launchpad",
        page_url="https://go.oncehub.com/NYULeslie/Lean-Launchpad",
    )


# ── find_oncehub_slots ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_find_oncehub_slots_returns_structured_rows(monkeypatch: pytest.MonkeyPatch) -> None:
    state = _install_fakes(monkeypatch)
    tz = ZoneInfo("America/New_York")
    epoch = int(datetime(2026, 5, 15, 10, 0, tzinfo=tz).timestamp() * 1000)
    state["slots"] = [_slot(epoch)]

    result = await mcp_service.find_oncehub_slots(
        start_date="2026-05-10",
        end_date="2026-05-20",
        duration_minutes=90,
        preferred_time_window="morning",
    )

    assert state["list_calls"] == [
        {
            "start_date": "2026-05-10",
            "end_date": "2026-05-20",
            "duration_minutes": 90,
            "preferred_time_window": "morning",
        }
    ]
    assert result["room"]["label"] == "Lean/Launchpad"
    assert len(result["slots"]) == 1
    row = result["slots"][0]
    assert row["date"] == "2026-05-15"
    assert row["slot_start_epoch_ms"] == epoch
    assert row["duration_minutes"] == 90


# ── book_oncehub_room ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_book_oncehub_room_creates_event_when_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    state = _install_fakes(monkeypatch)
    tz = ZoneInfo("America/New_York")
    epoch = int(datetime(2026, 5, 15, 18, 0, tzinfo=tz).timestamp() * 1000)

    result = await mcp_service.book_oncehub_room(
        slot_start_epoch_ms=epoch,
        duration_minutes=90,
        title="Startup Growth Panel",
        num_attendees=30,
        event_type="speaker_panel",
        description="Panel on scale-ups",
        approved_by_user_id="user_42",
    )

    # A new event is created when event_id is omitted.
    assert len(state["create_event_calls"]) == 1
    created = state["create_event_calls"][0]
    assert created["title"] == "Startup Growth Panel"
    assert created["event_date"] == "2026-05-15"
    assert created["event_time"] == "6:00 PM"
    assert created["event_end_time"] == "7:30 PM"
    assert created["location"] == "Lean/Launchpad"
    assert created["status"] == "draft"
    assert created["needs_outreach"] is False

    # Receipt is upserted to event_room_bookings under the new event id.
    assert len(state["upsert_booking_calls"]) == 1
    upsert = state["upsert_booking_calls"][0]
    assert upsert["event_id"] == "evt_new_42"
    assert upsert["provider"] == "oncehub"
    assert upsert["room_label"] == "Lean/Launchpad"
    assert upsert["booking_reference"] == "bk_1"
    assert upsert["slot_start_epoch_ms"] == epoch
    assert upsert["approver_user_id"] == "user_42"
    assert json.loads(upsert["raw_response_json"]) == {"ok": True}

    # Sticky milestone is applied.
    assert state["milestones_calls"] == [
        {"event_id": "evt_new_42", "speaker_confirmed": None, "room_confirmed": True}
    ]

    # Return payload exposes the new event id + receipt details for the agent summary.
    assert result["event_id"] == "evt_new_42"
    assert result["event_created"] is True
    assert result["booking_reference"] == "bk_1"
    assert result["room_label"] == "Lean/Launchpad"


@pytest.mark.asyncio
async def test_book_oncehub_room_uses_existing_event_when_provided(monkeypatch: pytest.MonkeyPatch) -> None:
    state = _install_fakes(monkeypatch)
    tz = ZoneInfo("America/New_York")
    epoch = int(datetime(2026, 5, 16, 10, 0, tzinfo=tz).timestamp() * 1000)

    result = await mcp_service.book_oncehub_room(
        slot_start_epoch_ms=epoch,
        duration_minutes=60,
        title="Workshop",
        num_attendees=20,
        event_id="evt_existing",
    )

    # No new event is created when event_id is supplied.
    assert state["create_event_calls"] == []
    # Booking receipt attaches to the existing event.
    assert state["upsert_booking_calls"][0]["event_id"] == "evt_existing"
    # Milestone fires on the existing event.
    assert state["milestones_calls"][0]["event_id"] == "evt_existing"
    assert result["event_id"] == "evt_existing"
    assert result["event_created"] is False


@pytest.mark.asyncio
async def test_book_oncehub_room_preserves_receipt_when_convex_upsert_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """OnceHub side succeeded, Convex write failed after create_event — the
    caller must still see the booking_reference so the operator can recover.
    """
    state = _install_fakes(monkeypatch)

    class FlakyConvex(FakeConvexClient):
        async def upsert_event_room_booking(self, **kwargs):
            raise RuntimeError("Convex upsert transport failed")

    monkeypatch.setattr(mcp_service, "ConvexClient", lambda: FlakyConvex(state))

    tz = ZoneInfo("America/New_York")
    epoch = int(datetime(2026, 5, 15, 18, 0, tzinfo=tz).timestamp() * 1000)

    result = await mcp_service.book_oncehub_room(
        slot_start_epoch_ms=epoch,
        duration_minutes=90,
        title="Growth Panel",
        num_attendees=30,
    )

    # Tool does NOT raise — it returns the OnceHub receipt with partial-failure info.
    assert result["booking_reference"] == "bk_1"
    assert result["booking_status"] == "confirmed"
    assert result["convex_sync"] == "failed"
    assert "Convex upsert transport failed" in (result["convex_error"] or "")
    # create_event ran before the upsert failed, so the event id is still surfaced.
    assert result["event_id"] == "evt_new_42"
    assert result["event_created"] is True
    # No milestone call happened (upsert threw before reaching it).
    assert state["milestones_calls"] == []


@pytest.mark.asyncio
async def test_book_oncehub_room_partial_failure_when_create_event_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Even if create_event itself fails, the receipt reference is preserved."""
    state = _install_fakes(monkeypatch)

    class FlakyConvex(FakeConvexClient):
        async def create_event(self, event):
            raise RuntimeError("Convex create_event failed")

    monkeypatch.setattr(mcp_service, "ConvexClient", lambda: FlakyConvex(state))

    tz = ZoneInfo("America/New_York")
    epoch = int(datetime(2026, 5, 15, 18, 0, tzinfo=tz).timestamp() * 1000)

    result = await mcp_service.book_oncehub_room(
        slot_start_epoch_ms=epoch,
        duration_minutes=60,
        title="Social",
        num_attendees=20,
    )

    assert result["booking_reference"] == "bk_1"
    assert result["convex_sync"] == "failed"
    assert result["event_id"] is None
    assert result["event_created"] is False


# ── get_event_room_booking ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_event_room_booking_passes_through(monkeypatch: pytest.MonkeyPatch) -> None:
    state = _install_fakes(monkeypatch)
    state["get_booking_result"] = {"event_id": "evt_1", "booking_reference": "bk_9"}

    result = await mcp_service.get_event_room_booking("evt_1")

    assert state["get_booking_calls"] == ["evt_1"]
    assert result == {"event_id": "evt_1", "booking_reference": "bk_9"}
