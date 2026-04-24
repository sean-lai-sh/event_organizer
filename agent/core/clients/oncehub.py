"""
Async OnceHub client for the Leslie eLab `Lean/Launchpad` room.

Live availability and booking are Playwright-backed by default. Tests and any
callers that want deterministic behavior can inject a `SlotBackend` that mocks
the browser surface.

Design contract (see issue #52):
- Discovery is locked to the `Lean/Launchpad` room for the MVP.
- Month ranges are computed timezone-aware (America/New_York) so month
  boundaries match what users see at go.oncehub.com/NYULeslie.
- Slot search returns a stable, JSON-serializable payload.
- Booking submission reads the shared club profile from env vars and returns a
  stable response mapping (status, reference, raw payload).
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any, Protocol
from zoneinfo import ZoneInfo


ONCEHUB_BASE_URL = "https://go.oncehub.com/NYULeslie"
LEAN_LAUNCHPAD_ROOM = "Lean/Launchpad"
LEAN_LAUNCHPAD_ROOM_LABEL = "Lean/Launchpad (fits 30 - 50 people)"
ELAB_TIMEZONE = "America/New_York"

ALLOWED_DURATIONS = (30, 45, 60, 75, 90, 105, 120)
DEFAULT_DURATION_MINUTES = 90

PROVIDER_NAME = "oncehub"

# Shared-profile env var contract. These are read lazily so unit tests do not
# need them configured.
ENV_FIRST_NAME = "ONCEHUB_PROFILE_FIRST_NAME"
ENV_LAST_NAME = "ONCEHUB_PROFILE_LAST_NAME"
ENV_EMAIL = "ONCEHUB_PROFILE_EMAIL"
ENV_NETID = "ONCEHUB_PROFILE_NETID"
ENV_AFFILIATION = "ONCEHUB_PROFILE_AFFILIATION"
ENV_SCHOOL = "ONCEHUB_PROFILE_SCHOOL"
ENV_ORG_NAME = "ONCEHUB_PROFILE_ORG_NAME"


@dataclass(frozen=True)
class OnceHubSlot:
    """One discovered booking slot."""

    date: str               # "YYYY-MM-DD" in ELAB_TIMEZONE
    day_of_week: str        # "Monday"
    time_slot: str          # "10:00 AM"
    slot_start_epoch_ms: int
    duration_minutes: int
    room_label: str = LEAN_LAUNCHPAD_ROOM_LABEL

    def to_dict(self) -> dict[str, Any]:
        return {
            "date": self.date,
            "day_of_week": self.day_of_week,
            "time_slot": self.time_slot,
            "slot_start_epoch_ms": self.slot_start_epoch_ms,
            "duration_minutes": self.duration_minutes,
            "room_label": self.room_label,
        }


@dataclass
class BookingProfile:
    """Shared club identity used when the agent submits a OnceHub booking."""

    first_name: str
    last_name: str
    email: str
    netid: str
    affiliation: str
    school: str
    organization_name: str

    @classmethod
    def from_env(cls) -> "BookingProfile":
        missing = [
            name
            for name in (
                ENV_FIRST_NAME,
                ENV_LAST_NAME,
                ENV_EMAIL,
                ENV_NETID,
                ENV_AFFILIATION,
                ENV_SCHOOL,
                ENV_ORG_NAME,
            )
            if not os.environ.get(name)
        ]
        if missing:
            raise RuntimeError(
                "OnceHub booking profile env vars not configured: "
                + ", ".join(missing)
            )
        return cls(
            first_name=os.environ[ENV_FIRST_NAME],
            last_name=os.environ[ENV_LAST_NAME],
            email=os.environ[ENV_EMAIL],
            netid=os.environ[ENV_NETID],
            affiliation=os.environ[ENV_AFFILIATION],
            school=os.environ[ENV_SCHOOL],
            organization_name=os.environ[ENV_ORG_NAME],
        )


@dataclass(frozen=True)
class BookingResult:
    """Stable mapping of a submitted OnceHub booking response."""

    status: str                    # "confirmed" | "failed"
    booking_reference: str | None
    confirmation_url: str | None
    raw_response: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "booking_reference": self.booking_reference,
            "confirmation_url": self.confirmation_url,
            "raw_response": self.raw_response,
        }


class SlotBackend(Protocol):
    """Pluggable transport. The default implementation drives Playwright."""

    async def find_slots(
        self,
        *,
        start_date: date,
        end_date: date,
        duration_minutes: int,
        room_label: str,
    ) -> list[OnceHubSlot]: ...

    async def submit_booking(
        self,
        *,
        slot_start_epoch_ms: int,
        duration_minutes: int,
        title: str,
        num_attendees: int,
        description: str | None,
        profile: BookingProfile,
        room_label: str,
    ) -> BookingResult: ...


# ── Pure helpers (no I/O, fully unit-testable) ────────────────────────────────


def months_in_range(start: date, end: date) -> list[tuple[int, int]]:
    """Inclusive list of (year, month) covering the date range in order."""
    if end < start:
        raise ValueError("end must be on or after start")
    months: list[tuple[int, int]] = []
    cur_year, cur_month = start.year, start.month
    end_year, end_month = end.year, end.month
    while (cur_year, cur_month) <= (end_year, end_month):
        months.append((cur_year, cur_month))
        if cur_month == 12:
            cur_year += 1
            cur_month = 1
        else:
            cur_month += 1
    return months


def month_bounds_local(year: int, month: int, tz_name: str = ELAB_TIMEZONE) -> tuple[date, date]:
    """Return the first and last calendar day of `year`/`month` in the given tz."""
    tz = ZoneInfo(tz_name)
    first = datetime(year, month, 1, tzinfo=tz).date()
    if month == 12:
        next_first = datetime(year + 1, 1, 1, tzinfo=tz).date()
    else:
        next_first = datetime(year, month + 1, 1, tzinfo=tz).date()
    last = next_first - timedelta(days=1)
    return first, last


def normalize_duration(minutes: int) -> int:
    """Return a duration value accepted by OnceHub, raising on bad input."""
    if minutes not in ALLOWED_DURATIONS:
        raise ValueError(
            f"Unsupported duration {minutes}; allowed: {sorted(ALLOWED_DURATIONS)}"
        )
    return minutes


def parse_time_slot(day: date, time_slot: str, tz_name: str = ELAB_TIMEZONE) -> datetime:
    """
    Parse an OnceHub displayed time string like `"10:00 AM"` against a local date
    and return a timezone-aware datetime.
    """
    cleaned = time_slot.strip().upper().replace(".", "")
    # Accept "10:00 AM", "10:00AM", "10 AM"
    for fmt in ("%I:%M %p", "%I:%M%p", "%I %p"):
        try:
            hm = datetime.strptime(cleaned, fmt)
            break
        except ValueError:
            hm = None
    if hm is None:
        raise ValueError(f"Unparseable OnceHub time slot: {time_slot!r}")
    return datetime(
        day.year,
        day.month,
        day.day,
        hm.hour,
        hm.minute,
        tzinfo=ZoneInfo(tz_name),
    )


def to_epoch_ms(dt: datetime) -> int:
    if dt.tzinfo is None:
        raise ValueError("datetime must be timezone-aware")
    return int(dt.timestamp() * 1000)


def from_epoch_ms(epoch_ms: int, tz_name: str = ELAB_TIMEZONE) -> datetime:
    return datetime.fromtimestamp(epoch_ms / 1000, tz=ZoneInfo(tz_name))


def filter_slots_by_window(
    slots: list[OnceHubSlot],
    preferred_time_window: str | None,
) -> list[OnceHubSlot]:
    """
    Restrict slots to a preferred window of the day.

    Accepts loose strings: `"morning"`, `"afternoon"`, `"evening"`, `"any"` or a
    raw range like `"09:00-13:00"`. Returns a new list; input is not mutated.
    """
    if not preferred_time_window:
        return list(slots)
    key = preferred_time_window.strip().lower()
    window = _named_windows().get(key)
    if window is None:
        window = _parse_window_range(key)
    if window is None:
        return list(slots)

    start_min, end_min = window
    kept: list[OnceHubSlot] = []
    for slot in slots:
        dt = from_epoch_ms(slot.slot_start_epoch_ms)
        minutes = dt.hour * 60 + dt.minute
        if start_min <= minutes < end_min:
            kept.append(slot)
    return kept


def _named_windows() -> dict[str, tuple[int, int]]:
    return {
        "morning": (6 * 60, 12 * 60),
        "afternoon": (12 * 60, 17 * 60),
        "evening": (17 * 60, 22 * 60),
        "any": (0, 24 * 60),
        "all": (0, 24 * 60),
    }


def _parse_window_range(value: str) -> tuple[int, int] | None:
    if "-" not in value:
        return None
    left, right = value.split("-", 1)
    try:
        start_h, start_m = _parse_hm(left)
        end_h, end_m = _parse_hm(right)
    except ValueError:
        return None
    return start_h * 60 + start_m, end_h * 60 + end_m


def _parse_hm(value: str) -> tuple[int, int]:
    v = value.strip()
    if ":" in v:
        h, m = v.split(":", 1)
        return int(h), int(m)
    return int(v), 0


def compute_slot_end_epoch_ms(slot_start_epoch_ms: int, duration_minutes: int) -> int:
    return slot_start_epoch_ms + duration_minutes * 60 * 1000


def format_slot_labels(slot_start_epoch_ms: int, duration_minutes: int) -> dict[str, str]:
    """
    Produce human-readable labels for approval UIs:
      { "booked_date", "booked_time", "booked_end_time", "display" }
    All values are rendered in ELAB_TIMEZONE.
    """
    start = from_epoch_ms(slot_start_epoch_ms)
    end = from_epoch_ms(compute_slot_end_epoch_ms(slot_start_epoch_ms, duration_minutes))
    return {
        "booked_date": start.strftime("%Y-%m-%d"),
        "booked_time": start.strftime("%I:%M %p").lstrip("0"),
        "booked_end_time": end.strftime("%I:%M %p").lstrip("0"),
        "display": (
            f"{start.strftime('%a %b %d, %Y')} "
            f"{start.strftime('%I:%M %p').lstrip('0')} – "
            f"{end.strftime('%I:%M %p').lstrip('0')} ET"
        ),
    }


def map_booking_response(raw: dict[str, Any]) -> BookingResult:
    """
    Translate a raw OnceHub confirmation payload into a stable BookingResult.

    The live OnceHub booking flow is an HTML form submit; the confirmation page
    exposes a booking reference. We accept several shapes so the mapping is
    stable across Playwright-based, API-based, or mocked responses.
    """
    if not isinstance(raw, dict):
        return BookingResult(
            status="failed",
            booking_reference=None,
            confirmation_url=None,
            raw_response={"error": "non-dict response", "value": repr(raw)},
        )

    status_raw = str(raw.get("status") or raw.get("result") or "").strip().lower()
    if status_raw in {"ok", "success", "confirmed", "booked"}:
        status = "confirmed"
    elif status_raw in {"error", "failed", "failure", "declined"}:
        status = "failed"
    else:
        status = "confirmed" if (raw.get("booking_reference") or raw.get("reference") or raw.get("confirmation_id")) else "failed"

    reference = (
        raw.get("booking_reference")
        or raw.get("reference")
        or raw.get("confirmation_id")
        or raw.get("id")
    )
    if reference is not None:
        reference = str(reference)

    confirmation_url = (
        raw.get("confirmation_url")
        or raw.get("url")
        or raw.get("page_url")
    )
    if confirmation_url is not None:
        confirmation_url = str(confirmation_url)

    return BookingResult(
        status=status,
        booking_reference=reference,
        confirmation_url=confirmation_url,
        raw_response=dict(raw),
    )


# ── Client ────────────────────────────────────────────────────────────────────


class OnceHubClient:
    """
    High-level async facade over a `SlotBackend`.

    The default backend lazy-imports Playwright so unit tests that inject a
    `backend` never require the browser dependency to be installed.
    """

    def __init__(
        self,
        *,
        backend: SlotBackend | None = None,
        room_label: str = LEAN_LAUNCHPAD_ROOM_LABEL,
        page_url: str = ONCEHUB_BASE_URL,
    ) -> None:
        self._backend = backend
        self._room_label = room_label
        self._page_url = page_url

    @property
    def room_label(self) -> str:
        return self._room_label

    @property
    def page_url(self) -> str:
        return self._page_url

    def _resolve_backend(self) -> SlotBackend:
        if self._backend is None:
            raise RuntimeError(
                "OnceHubClient requires a SlotBackend. In production, pass a "
                "PlaywrightSlotBackend; in tests, inject a fake."
            )
        return self._backend

    async def find_slots(
        self,
        *,
        start_date: str,
        end_date: str,
        duration_minutes: int = DEFAULT_DURATION_MINUTES,
        preferred_time_window: str | None = None,
    ) -> list[OnceHubSlot]:
        start = date.fromisoformat(start_date)
        end = date.fromisoformat(end_date)
        if end < start:
            raise ValueError("end_date must be on or after start_date")

        normalize_duration(duration_minutes)
        backend = self._resolve_backend()
        raw = await backend.find_slots(
            start_date=start,
            end_date=end,
            duration_minutes=duration_minutes,
            room_label=self._room_label,
        )
        return filter_slots_by_window(raw, preferred_time_window)

    async def book_slot(
        self,
        *,
        slot_start_epoch_ms: int,
        duration_minutes: int,
        title: str,
        num_attendees: int,
        description: str | None = None,
        profile: BookingProfile | None = None,
    ) -> BookingResult:
        normalize_duration(duration_minutes)
        if num_attendees <= 0:
            raise ValueError("num_attendees must be positive")
        booking_profile = profile or BookingProfile.from_env()
        backend = self._resolve_backend()
        return await backend.submit_booking(
            slot_start_epoch_ms=slot_start_epoch_ms,
            duration_minutes=duration_minutes,
            title=title,
            num_attendees=num_attendees,
            description=description,
            profile=booking_profile,
            room_label=self._room_label,
        )


__all__ = [
    "ALLOWED_DURATIONS",
    "BookingProfile",
    "BookingResult",
    "DEFAULT_DURATION_MINUTES",
    "ELAB_TIMEZONE",
    "ENV_AFFILIATION",
    "ENV_EMAIL",
    "ENV_FIRST_NAME",
    "ENV_LAST_NAME",
    "ENV_NETID",
    "ENV_ORG_NAME",
    "ENV_SCHOOL",
    "LEAN_LAUNCHPAD_ROOM",
    "LEAN_LAUNCHPAD_ROOM_LABEL",
    "ONCEHUB_BASE_URL",
    "OnceHubClient",
    "OnceHubSlot",
    "PROVIDER_NAME",
    "SlotBackend",
    "compute_slot_end_epoch_ms",
    "filter_slots_by_window",
    "format_slot_labels",
    "from_epoch_ms",
    "map_booking_response",
    "month_bounds_local",
    "months_in_range",
    "normalize_duration",
    "parse_time_slot",
    "to_epoch_ms",
]
