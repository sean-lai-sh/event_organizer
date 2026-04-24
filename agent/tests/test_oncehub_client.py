"""Unit tests for the repo-owned async OnceHub client (issue #52)."""
from __future__ import annotations

from datetime import date
from zoneinfo import ZoneInfo

import pytest

from core.clients.oncehub import (
    ALLOWED_DURATIONS,
    BookingProfile,
    BookingResult,
    ELAB_TIMEZONE,
    LEAN_LAUNCHPAD_ROOM_LABEL,
    OnceHubClient,
    OnceHubSlot,
    compute_slot_end_epoch_ms,
    filter_slots_by_window,
    format_slot_labels,
    from_epoch_ms,
    map_booking_response,
    month_bounds_local,
    months_in_range,
    normalize_duration,
    parse_time_slot,
    to_epoch_ms,
)


# ── months_in_range & month_bounds_local ─────────────────────────────────────


def test_months_in_range_handles_boundary_crossings() -> None:
    months = months_in_range(date(2026, 3, 29), date(2026, 5, 2))
    assert months == [(2026, 3), (2026, 4), (2026, 5)]


def test_months_in_range_single_month() -> None:
    assert months_in_range(date(2026, 4, 1), date(2026, 4, 30)) == [(2026, 4)]


def test_months_in_range_rejects_reversed_range() -> None:
    with pytest.raises(ValueError):
        months_in_range(date(2026, 4, 10), date(2026, 4, 1))


def test_month_bounds_last_day_is_correct() -> None:
    first, last = month_bounds_local(2026, 2)
    assert first == date(2026, 2, 1)
    assert last == date(2026, 2, 28)
    first_leap, last_leap = month_bounds_local(2028, 2)
    assert last_leap == date(2028, 2, 29)  # leap year
    first_dec, last_dec = month_bounds_local(2026, 12)
    assert first_dec == date(2026, 12, 1)
    assert last_dec == date(2026, 12, 31)


# ── duration handling ────────────────────────────────────────────────────────


def test_normalize_duration_accepts_allowed_values() -> None:
    for minutes in ALLOWED_DURATIONS:
        assert normalize_duration(minutes) == minutes


def test_normalize_duration_rejects_unsupported() -> None:
    with pytest.raises(ValueError):
        normalize_duration(77)


# ── time parsing ─────────────────────────────────────────────────────────────


def test_parse_time_slot_handles_common_formats() -> None:
    dt = parse_time_slot(date(2026, 5, 4), "10:00 AM")
    assert dt.tzinfo is not None
    assert dt.hour == 10 and dt.minute == 0
    assert dt.utcoffset() is not None


def test_parse_time_slot_rejects_garbage() -> None:
    with pytest.raises(ValueError):
        parse_time_slot(date(2026, 5, 4), "not a time")


def test_epoch_ms_roundtrip_in_et_timezone() -> None:
    dt = parse_time_slot(date(2026, 5, 4), "2:30 PM")
    epoch_ms = to_epoch_ms(dt)
    dt_back = from_epoch_ms(epoch_ms)
    assert dt_back.tzinfo is not None
    assert dt_back.strftime("%Y-%m-%d %H:%M") == "2026-05-04 14:30"


# ── preferred time window filtering ──────────────────────────────────────────


def _slot_at(time_str: str) -> OnceHubSlot:
    day = date(2026, 5, 4)
    dt = parse_time_slot(day, time_str)
    return OnceHubSlot(
        date=day.isoformat(),
        day_of_week=day.strftime("%A"),
        time_slot=time_str,
        slot_start_epoch_ms=to_epoch_ms(dt),
        duration_minutes=90,
    )


def test_filter_slots_by_window_named() -> None:
    slots = [_slot_at("8:00 AM"), _slot_at("10:00 AM"), _slot_at("2:00 PM"), _slot_at("6:00 PM")]
    morning = filter_slots_by_window(slots, "morning")
    assert [s.time_slot for s in morning] == ["8:00 AM", "10:00 AM"]
    evening = filter_slots_by_window(slots, "evening")
    assert [s.time_slot for s in evening] == ["6:00 PM"]


def test_filter_slots_by_window_custom_range() -> None:
    slots = [_slot_at("9:00 AM"), _slot_at("11:30 AM"), _slot_at("1:00 PM")]
    kept = filter_slots_by_window(slots, "10:00-12:00")
    assert [s.time_slot for s in kept] == ["11:30 AM"]


def test_filter_slots_by_window_noop_when_unspecified() -> None:
    slots = [_slot_at("9:00 AM"), _slot_at("5:00 PM")]
    assert filter_slots_by_window(slots, None) == slots
    assert filter_slots_by_window(slots, "unrecognized-window") == slots


# ── slot label formatting ────────────────────────────────────────────────────


def test_format_slot_labels_renders_et_with_duration() -> None:
    dt = parse_time_slot(date(2026, 5, 4), "10:00 AM")
    epoch_ms = to_epoch_ms(dt)
    labels = format_slot_labels(epoch_ms, 90)
    assert labels["booked_date"] == "2026-05-04"
    assert labels["booked_time"] == "10:00 AM"
    assert labels["booked_end_time"] == "11:30 AM"
    assert "10:00 AM" in labels["display"]
    assert "11:30 AM" in labels["display"]


def test_compute_slot_end_epoch_ms_matches_duration() -> None:
    assert compute_slot_end_epoch_ms(0, 90) == 90 * 60 * 1000


# ── booking response mapping ─────────────────────────────────────────────────


def test_map_booking_response_confirmed_from_reference() -> None:
    result = map_booking_response({"booking_reference": "ABC-123"})
    assert result.status == "confirmed"
    assert result.booking_reference == "ABC-123"
    assert result.raw_response == {"booking_reference": "ABC-123"}


def test_map_booking_response_failed_when_explicit() -> None:
    result = map_booking_response({"status": "error", "message": "nope"})
    assert result.status == "failed"
    assert result.booking_reference is None


def test_map_booking_response_non_dict() -> None:
    result = map_booking_response("boom")  # type: ignore[arg-type]
    assert result.status == "failed"
    assert "non-dict response" in result.raw_response["error"]


def test_booking_result_to_dict_is_stable() -> None:
    result = BookingResult(
        status="confirmed",
        booking_reference="REF",
        confirmation_url="https://example.com",
        raw_response={"x": 1},
    )
    assert result.to_dict() == {
        "status": "confirmed",
        "booking_reference": "REF",
        "confirmation_url": "https://example.com",
        "raw_response": {"x": 1},
    }


# ── BookingProfile ───────────────────────────────────────────────────────────


def test_booking_profile_from_env_raises_when_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    # Strip any defaults from ambient .env so the test reflects a clean env.
    for key in (
        "ONCEHUB_PROFILE_FIRST_NAME",
        "ONCEHUB_PROFILE_LAST_NAME",
        "ONCEHUB_PROFILE_EMAIL",
        "ONCEHUB_PROFILE_NETID",
        "ONCEHUB_PROFILE_AFFILIATION",
        "ONCEHUB_PROFILE_SCHOOL",
        "ONCEHUB_PROFILE_ORG_NAME",
    ):
        monkeypatch.delenv(key, raising=False)

    with pytest.raises(RuntimeError) as exc:
        BookingProfile.from_env()
    assert "ONCEHUB_PROFILE_FIRST_NAME" in str(exc.value)


def test_booking_profile_from_env_reads_all(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ONCEHUB_PROFILE_FIRST_NAME", "Club")
    monkeypatch.setenv("ONCEHUB_PROFILE_LAST_NAME", "Bot")
    monkeypatch.setenv("ONCEHUB_PROFILE_EMAIL", "club@nyu.edu")
    monkeypatch.setenv("ONCEHUB_PROFILE_NETID", "cb123")
    monkeypatch.setenv("ONCEHUB_PROFILE_AFFILIATION", "Undergrad")
    monkeypatch.setenv("ONCEHUB_PROFILE_SCHOOL", "Tandon")
    monkeypatch.setenv("ONCEHUB_PROFILE_ORG_NAME", "Example Club")

    profile = BookingProfile.from_env()
    assert profile.first_name == "Club"
    assert profile.email == "club@nyu.edu"
    assert profile.organization_name == "Example Club"


# ── OnceHubClient with an injected backend ───────────────────────────────────


class FakeSlotBackend:
    def __init__(self, slots: list[OnceHubSlot] | None = None, booking: BookingResult | None = None) -> None:
        self.slots = slots or []
        self.booking = booking or BookingResult(status="confirmed", booking_reference="REF", confirmation_url=None)
        self.find_calls: list[dict] = []
        self.book_calls: list[dict] = []

    async def find_slots(self, *, start_date, end_date, duration_minutes, room_label) -> list[OnceHubSlot]:
        self.find_calls.append(
            {
                "start_date": start_date,
                "end_date": end_date,
                "duration_minutes": duration_minutes,
                "room_label": room_label,
            }
        )
        return list(self.slots)

    async def submit_booking(
        self,
        *,
        slot_start_epoch_ms,
        duration_minutes,
        title,
        num_attendees,
        description,
        profile,
        room_label,
    ) -> BookingResult:
        self.book_calls.append(
            {
                "slot_start_epoch_ms": slot_start_epoch_ms,
                "duration_minutes": duration_minutes,
                "title": title,
                "num_attendees": num_attendees,
                "description": description,
                "profile": profile,
                "room_label": room_label,
            }
        )
        return self.booking


@pytest.mark.asyncio
async def test_client_find_slots_delegates_and_filters() -> None:
    backend = FakeSlotBackend(slots=[_slot_at("10:00 AM"), _slot_at("2:00 PM"), _slot_at("6:00 PM")])
    client = OnceHubClient(backend=backend)

    results = await client.find_slots(
        start_date="2026-05-04",
        end_date="2026-05-10",
        duration_minutes=90,
        preferred_time_window="afternoon",
    )

    assert backend.find_calls == [
        {
            "start_date": date(2026, 5, 4),
            "end_date": date(2026, 5, 10),
            "duration_minutes": 90,
            "room_label": LEAN_LAUNCHPAD_ROOM_LABEL,
        }
    ]
    assert [s.time_slot for s in results] == ["2:00 PM"]


@pytest.mark.asyncio
async def test_client_find_slots_handles_empty_availability() -> None:
    client = OnceHubClient(backend=FakeSlotBackend(slots=[]))
    results = await client.find_slots(
        start_date="2026-05-04",
        end_date="2026-05-10",
        duration_minutes=60,
    )
    assert results == []


@pytest.mark.asyncio
async def test_client_find_slots_rejects_reversed_range() -> None:
    client = OnceHubClient(backend=FakeSlotBackend())
    with pytest.raises(ValueError):
        await client.find_slots(start_date="2026-05-10", end_date="2026-05-04", duration_minutes=60)


@pytest.mark.asyncio
async def test_client_book_slot_passes_profile_and_room(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ONCEHUB_PROFILE_FIRST_NAME", "Club")
    monkeypatch.setenv("ONCEHUB_PROFILE_LAST_NAME", "Bot")
    monkeypatch.setenv("ONCEHUB_PROFILE_EMAIL", "club@nyu.edu")
    monkeypatch.setenv("ONCEHUB_PROFILE_NETID", "cb123")
    monkeypatch.setenv("ONCEHUB_PROFILE_AFFILIATION", "Undergrad")
    monkeypatch.setenv("ONCEHUB_PROFILE_SCHOOL", "Tandon")
    monkeypatch.setenv("ONCEHUB_PROFILE_ORG_NAME", "Example Club")

    backend = FakeSlotBackend(booking=BookingResult(status="confirmed", booking_reference="REF", confirmation_url=None))
    client = OnceHubClient(backend=backend)

    result = await client.book_slot(
        slot_start_epoch_ms=to_epoch_ms(parse_time_slot(date(2026, 5, 4), "10:00 AM")),
        duration_minutes=90,
        title="Startup Panel",
        num_attendees=40,
        description="Cool event",
    )

    assert result.status == "confirmed"
    assert len(backend.book_calls) == 1
    call = backend.book_calls[0]
    assert call["room_label"] == LEAN_LAUNCHPAD_ROOM_LABEL
    assert call["profile"].email == "club@nyu.edu"
    assert call["num_attendees"] == 40


@pytest.mark.asyncio
async def test_client_book_slot_validates_attendees(monkeypatch: pytest.MonkeyPatch) -> None:
    client = OnceHubClient(backend=FakeSlotBackend())
    with pytest.raises(ValueError):
        await client.book_slot(
            slot_start_epoch_ms=0,
            duration_minutes=90,
            title="X",
            num_attendees=0,
            profile=BookingProfile(
                first_name="A",
                last_name="B",
                email="a@b.c",
                netid="nid",
                affiliation="Undergrad",
                school="Tandon",
                organization_name="Org",
            ),
        )


def test_elab_timezone_is_america_new_york() -> None:
    # Guard against a regression if someone "simplifies" the tz.
    assert ELAB_TIMEZONE == "America/New_York"
    assert ZoneInfo(ELAB_TIMEZONE).key == "America/New_York"
