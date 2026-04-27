"""Unit tests for the repo-owned async OnceHub client (issue #52).

These cover:
- Room discovery pinned to the configured page/label (Lean/Launchpad).
- Timezone-aware month-range calculation used to split availability queries.
- Slot lookup by date range + duration, including month-boundary parsing.
- Duration handling.
- Empty-availability path.
- Booking response mapping and shared-profile submission.
- Internal API date-key parsing (0-indexed months).
"""
from __future__ import annotations

from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import pytest

from core.clients.oncehub import (
    DEFAULT_ROOM_LABEL,
    OnceHubClient,
    OnceHubSlot,
    month_ranges,
    _parse_oncehub_date_key,
)


@pytest.fixture(autouse=True)
def _oncehub_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ONCEHUB_PAGE_URL", "https://go.oncehub.com/NYULeslie")


def _make_client() -> OnceHubClient:
    return OnceHubClient(tz_name="America/New_York")


class _StubClient(OnceHubClient):
    """OnceHubClient subclass that overrides the transport hooks so tests
    exercise the parsing/filtering layer without hitting HTTP."""

    def __init__(self, *, slot_entries: list[dict] | None = None, booking_body: dict | None = None) -> None:
        super().__init__(tz_name="America/New_York")
        self._stub_slot_entries_by_month: dict[tuple[int, int], list[dict]] = {}
        if slot_entries is not None:
            self._stub_slot_entries_by_month[(0, 0)] = slot_entries
        self._booking_body = booking_body or {
            "meetingStatus": "proposed",
            "isError": False,
            "encodedMeetingId": "bk_123",
        }
        self.booking_calls: list[dict] = []
        self.list_calls: list[dict] = []
        # Pre-populate room IDs so we don't need HTTP
        self._room_ids = {
            "label": "Lean/Launchpad (fits 30 - 50 people)",
            "settings_id": "MTM2Mjg0",
            "meetme_link_id": "MTQ1OTg5",
            "owner_user_id": "fake-owner-id",
            "link_name": "LeslieLarge",
            "book_now_link_id": "MTM4NTMz",
            "category_id": "NjYyMQ==",
            "theme_id": "fake-theme",
        }

    def set_month_entries(self, year: int, month: int, entries: list[dict]) -> None:
        self._stub_slot_entries_by_month[(year, month)] = entries

    async def _raw_list_slots(
        self,
        *,
        page_url: str,
        year: int,
        month: int,
        duration_minutes: int,
    ) -> list[dict[str, Any]]:
        self.list_calls.append(
            {"page_url": page_url, "year": year, "month": month, "duration_minutes": duration_minutes}
        )
        return self._stub_slot_entries_by_month.get(
            (year, month), self._stub_slot_entries_by_month.get((0, 0), [])
        )

    async def _raw_submit_booking(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.booking_calls.append(payload)
        return self._booking_body


# ── _parse_oncehub_date_key ──────────────────────────────────────────

def test_parse_oncehub_date_key_zero_indexed_month() -> None:
    """OnceHub date keys use 0-indexed months: '2026-3-16' = April 16."""
    from datetime import date as d
    assert _parse_oncehub_date_key("2026-3-16") == d(2026, 4, 16)
    assert _parse_oncehub_date_key("2026-0-1") == d(2026, 1, 1)
    assert _parse_oncehub_date_key("2026-11-31") == d(2026, 12, 31)


def test_parse_oncehub_date_key_invalid() -> None:
    assert _parse_oncehub_date_key("invalid") is None
    assert _parse_oncehub_date_key("") is None


# ── month_ranges ────────────────────────────────────────────────────────

def test_month_ranges_same_month() -> None:
    ranges = month_ranges("2026-05-03", "2026-05-20", tz_name="America/New_York")
    assert [(y, m) for y, m, _ in ranges] == [(2026, 5)]


def test_month_ranges_spans_multiple_months_including_year_boundary() -> None:
    ranges = month_ranges("2026-12-28", "2027-02-05", tz_name="America/New_York")
    assert [(y, m) for y, m, _ in ranges] == [
        (2026, 12),
        (2027, 1),
        (2027, 2),
    ]


def test_month_ranges_epoch_is_local_midnight_not_utc() -> None:
    ranges = month_ranges("2026-05-01", "2026-05-01", tz_name="America/New_York")
    _, _, epoch_ms = ranges[0]
    local = datetime.fromtimestamp(epoch_ms / 1000, tz=ZoneInfo("America/New_York"))
    assert local.hour == 0 and local.minute == 0 and local.day == 1


def test_month_ranges_rejects_reversed_range() -> None:
    with pytest.raises(ValueError):
        month_ranges("2026-06-01", "2026-05-01")


# ── Room discovery ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_resolve_room_returns_configured_page_url_and_label() -> None:
    client = _make_client()
    room = await client.resolve_room()
    assert room.label == DEFAULT_ROOM_LABEL
    assert room.page_url == "https://go.oncehub.com/NYULeslie"
    assert room.link_name == "NYULeslie"


@pytest.mark.asyncio
async def test_resolve_room_respects_room_label_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ONCEHUB_ROOM_LABEL", "Custom Room")
    room = await _make_client().resolve_room()
    assert room.label == "Custom Room"


# ── list_slots ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_slots_filters_out_of_range_dates_and_sorts() -> None:
    client = _StubClient(
        slot_entries=[
            {"start_time": "2026-05-15T10:00:00-04:00"},
            {"start_time": "2026-05-20T18:30:00-04:00"},
            # Out of range: should be filtered
            {"start_time": "2026-05-02T09:00:00-04:00"},
            {"start_time": "2026-05-31T09:00:00-04:00"},
        ]
    )
    slots = await client.list_slots(
        start_date="2026-05-10",
        end_date="2026-05-25",
        duration_minutes=90,
    )

    assert [s.display_date for s in slots] == ["2026-05-15", "2026-05-20"]
    assert [s.start_epoch_ms for s in slots] == sorted(s.start_epoch_ms for s in slots)
    assert all(isinstance(s, OnceHubSlot) for s in slots)
    assert all(s.duration_minutes == 90 for s in slots)
    # End time is start + duration
    assert slots[0].display_time == "10:00 AM"
    assert slots[0].display_end_time == "11:30 AM"


@pytest.mark.asyncio
async def test_list_slots_issues_one_request_per_month_across_boundary() -> None:
    client = _StubClient()
    client.set_month_entries(2026, 5, [{"start_time": "2026-05-31T09:00:00-04:00"}])
    client.set_month_entries(2026, 6, [{"start_time": "2026-06-01T10:00:00-04:00"}])

    slots = await client.list_slots(
        start_date="2026-05-31",
        end_date="2026-06-01",
        duration_minutes=60,
    )

    assert [(c["year"], c["month"]) for c in client.list_calls] == [(2026, 5), (2026, 6)]
    assert [s.display_date for s in slots] == ["2026-05-31", "2026-06-01"]


@pytest.mark.asyncio
async def test_list_slots_empty_availability_returns_empty_list() -> None:
    client = _StubClient(slot_entries=[])
    slots = await client.list_slots(
        start_date="2026-05-10",
        end_date="2026-05-25",
        duration_minutes=90,
    )
    assert slots == []


@pytest.mark.asyncio
async def test_list_slots_preferred_time_window_filter() -> None:
    client = _StubClient(
        slot_entries=[
            {"start_time": "2026-05-15T09:00:00-04:00"},   # morning
            {"start_time": "2026-05-15T13:30:00-04:00"},   # afternoon
            {"start_time": "2026-05-15T19:00:00-04:00"},   # evening
        ]
    )
    afternoon = await client.list_slots(
        start_date="2026-05-10",
        end_date="2026-05-20",
        duration_minutes=60,
        preferred_time_window="afternoon",
    )
    assert [s.display_time for s in afternoon] == ["1:30 PM"]


@pytest.mark.asyncio
async def test_list_slots_rejects_non_positive_duration() -> None:
    client = _StubClient(slot_entries=[])
    with pytest.raises(ValueError):
        await client.list_slots(start_date="2026-05-10", end_date="2026-05-20", duration_minutes=0)


# ── submit_booking ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_submit_booking_maps_receipt_from_internal_api(monkeypatch: pytest.MonkeyPatch) -> None:
    # Mock the booking profile loader
    monkeypatch.setattr(
        "core.clients.oncehub._load_booking_profile",
        lambda: {
            "first_name": "Test",
            "last_name": "User",
            "email": "test@nyu.edu",
            "net_id": "tu123",
            "subject": "Default Subject",
            "event_name": "Default Event",
            "organization": "TestOrg",
            "num_attendees": "10",
            "graduation_year": "2027",
            "location": "16 Washington Place",
            "affiliation_id": "457707",
            "school_id": "453247",
            "pronouns_id": "",
        },
    )
    client = _StubClient(
        booking_body={
            "meetingStatus": "proposed",
            "isError": False,
            "encodedMeetingId": "enc_xyz",
            "bookingkey": "bk_xyz",
            "MeetingSubject": "Speaker Panel",
            "meetingLocation": "16 Washington Place",
        }
    )
    tz = ZoneInfo("America/New_York")
    start_dt = datetime(2026, 5, 15, 10, 0, tzinfo=tz)
    epoch_ms = int(start_dt.timestamp() * 1000)

    receipt = await client.submit_booking(
        slot_start_epoch_ms=epoch_ms,
        duration_minutes=90,
        title="Speaker Panel",
        num_attendees=30,
        description="Panel discussion",
        event_type="speaker_panel",
        target_profile="early-stage founders",
    )

    assert receipt.status == "proposed"
    assert receipt.booking_reference == "enc_xyz"
    assert receipt.raw["meetingStatus"] == "proposed"
    assert receipt.raw["isError"] is False

    assert len(client.booking_calls) == 1
    payload = client.booking_calls[0]
    # Internal API uses postData encoding, not structured JSON form
    assert "postData" in payload
    assert payload["IANATimeZone"] == "America/New_York"
    assert payload["sid"] == "MTM2Mjg0"


@pytest.mark.asyncio
async def test_submit_booking_error_response(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "core.clients.oncehub._load_booking_profile",
        lambda: {
            "first_name": "Test",
            "last_name": "User",
            "email": "test@nyu.edu",
            "net_id": "tu123",
            "subject": "Default",
            "event_name": "Default",
            "organization": "TestOrg",
            "num_attendees": "10",
            "graduation_year": "2027",
            "location": "16 Washington Place",
            "affiliation_id": "457707",
            "school_id": "453247",
            "pronouns_id": "",
        },
    )
    client = _StubClient(
        booking_body={"isError": True, "errorMessage": "Slot no longer available"}
    )
    tz = ZoneInfo("America/New_York")
    start_dt = datetime(2026, 5, 15, 10, 0, tzinfo=tz)
    receipt = await client.submit_booking(
        slot_start_epoch_ms=int(start_dt.timestamp() * 1000),
        duration_minutes=60,
        title="Workshop",
        num_attendees=20,
    )
    assert receipt.status == "error"
    assert receipt.booking_reference is None


@pytest.mark.asyncio
async def test_submit_booking_rejects_invalid_args(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "core.clients.oncehub._load_booking_profile",
        lambda: {
            "first_name": "Test",
            "last_name": "User",
            "email": "test@nyu.edu",
            "net_id": "tu123",
            "subject": "Default",
            "event_name": "Default",
            "organization": "TestOrg",
            "num_attendees": "10",
            "graduation_year": "2027",
            "location": "16 Washington Place",
            "affiliation_id": "457707",
            "school_id": "453247",
            "pronouns_id": "",
        },
    )
    client = _StubClient()
    with pytest.raises(ValueError):
        await client.submit_booking(
            slot_start_epoch_ms=1,
            duration_minutes=0,
            title="x",
            num_attendees=1,
        )
    with pytest.raises(ValueError):
        await client.submit_booking(
            slot_start_epoch_ms=1,
            duration_minutes=60,
            title="x",
            num_attendees=0,
        )
