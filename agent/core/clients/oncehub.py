"""Async OnceHub client for Leslie eLab room discovery and booking.

MVP scope (issue #52):
- Room discovery is locked to the Leslie eLab "Lean/Launchpad" room.
- Availability is always fetched live — no caching layer.
- Booking submits under a single shared club booking profile sourced from Doppler.
- Only first-time booking is supported; cancellation/rebooking is out of scope.

The client wraps OnceHub's v2 HTTP API. Concrete endpoint paths are hidden
behind thin wrapper methods (`_raw_list_slots`, `_raw_submit_booking`) so
tests can mock at the method boundary without spinning up HTTP fakes.
"""
from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import httpx

BASE_URL = "https://api.oncehub.com/v2"

DEFAULT_ROOM_LABEL = "Lean/Launchpad"
DEFAULT_TIMEZONE = "America/New_York"


@dataclass(frozen=True)
class OnceHubRoom:
    room_id: str
    label: str
    page_url: str
    link_name: str


@dataclass(frozen=True)
class OnceHubSlot:
    start_epoch_ms: int
    end_epoch_ms: int
    start_iso: str
    end_iso: str
    duration_minutes: int
    display_date: str
    display_day_of_week: str
    display_time: str
    display_end_time: str
    room_label: str
    page_url: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "slot_start_epoch_ms": self.start_epoch_ms,
            "slot_end_epoch_ms": self.end_epoch_ms,
            "start_iso": self.start_iso,
            "end_iso": self.end_iso,
            "duration_minutes": self.duration_minutes,
            "date": self.display_date,
            "day_of_week": self.display_day_of_week,
            "start_time": self.display_time,
            "end_time": self.display_end_time,
            "room_label": self.room_label,
            "page_url": self.page_url,
        }


@dataclass(frozen=True)
class OnceHubBookingReceipt:
    status: str
    booking_reference: str | None
    raw: dict[str, Any]


def _env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    return value


def _iter_months(start: date, end: date) -> list[tuple[int, int]]:
    """Return (year, month) tuples covering [start, end] inclusive."""
    months: list[tuple[int, int]] = []
    cursor = date(start.year, start.month, 1)
    last = date(end.year, end.month, 1)
    while cursor <= last:
        months.append((cursor.year, cursor.month))
        if cursor.month == 12:
            cursor = date(cursor.year + 1, 1, 1)
        else:
            cursor = date(cursor.year, cursor.month + 1, 1)
    return months


def month_ranges(
    start_date: str,
    end_date: str,
    tz_name: str = DEFAULT_TIMEZONE,
) -> list[tuple[int, int, int]]:
    """Split a date range into (year, month, epoch_ms_for_month_start) tuples.

    Epoch is computed with timezone awareness, so a month starting at
    midnight America/New_York is not confused with UTC midnight.
    """
    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)
    if end < start:
        raise ValueError("end_date must not be before start_date")

    tz = ZoneInfo(tz_name)
    out: list[tuple[int, int, int]] = []
    for year, month in _iter_months(start, end):
        first_of_month = datetime(year, month, 1, tzinfo=tz)
        out.append((year, month, int(first_of_month.timestamp() * 1000)))
    return out


def _format_slot(
    *,
    start_dt: datetime,
    duration_minutes: int,
    tz: ZoneInfo,
    room_label: str,
    page_url: str,
) -> OnceHubSlot:
    local_start = start_dt.astimezone(tz)
    local_end = local_start + timedelta(minutes=duration_minutes)
    return OnceHubSlot(
        start_epoch_ms=int(local_start.timestamp() * 1000),
        end_epoch_ms=int(local_end.timestamp() * 1000),
        start_iso=local_start.isoformat(),
        end_iso=local_end.isoformat(),
        duration_minutes=duration_minutes,
        display_date=local_start.date().isoformat(),
        display_day_of_week=local_start.strftime("%A"),
        display_time=local_start.strftime("%-I:%M %p"),
        display_end_time=local_end.strftime("%-I:%M %p"),
        room_label=room_label,
        page_url=page_url,
    )


def _parse_slot_entry(
    entry: dict[str, Any],
    *,
    duration_minutes: int,
    tz: ZoneInfo,
    room_label: str,
    page_url: str,
) -> OnceHubSlot | None:
    iso = entry.get("start_time") or entry.get("start") or entry.get("starts_at")
    if not iso:
        ms = entry.get("start_epoch_ms") or entry.get("epoch_ms")
        if ms is None:
            return None
        start_dt = datetime.fromtimestamp(int(ms) / 1000, tz=timezone.utc)
    else:
        try:
            start_dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        except ValueError:
            return None
        if start_dt.tzinfo is None:
            start_dt = start_dt.replace(tzinfo=tz)
    return _format_slot(
        start_dt=start_dt,
        duration_minutes=duration_minutes,
        tz=tz,
        room_label=room_label,
        page_url=page_url,
    )


def _within_window(slot: OnceHubSlot, window: str | None) -> bool:
    """Return True if slot's local start time falls in the window.

    Accepted forms:
      - "HH:MM-HH:MM" (24h, local)
      - "morning"  → 05:00–12:00
      - "afternoon" → 12:00–17:00
      - "evening"   → 17:00–22:00
    """
    if not window:
        return True
    label = window.strip().lower()
    named = {
        "morning": (time(5, 0), time(12, 0)),
        "afternoon": (time(12, 0), time(17, 0)),
        "evening": (time(17, 0), time(22, 0)),
    }
    if label in named:
        start_t, end_t = named[label]
    else:
        try:
            left, right = label.split("-", 1)
            start_t = time.fromisoformat(left.strip())
            end_t = time.fromisoformat(right.strip())
        except Exception:
            return True
    slot_dt = datetime.fromisoformat(slot.start_iso)
    slot_t = slot_dt.time()
    return start_t <= slot_t < end_t


class OnceHubClient:
    """Async client for OnceHub room lookup + booking.

    Authentication uses an API key loaded from `ONCEHUB_API_KEY`. The
    booking profile (who "owns" the booking) and the page URL for the
    Leslie eLab Lean/Launchpad room come from environment variables so
    they can be rotated via Doppler without code changes.
    """

    def __init__(self, *, timeout: float = 30.0, tz_name: str = DEFAULT_TIMEZONE) -> None:
        self._timeout = timeout
        self._tz_name = tz_name
        self._tz = ZoneInfo(tz_name)
        self._client: httpx.AsyncClient | None = None

    # ── Lifecycle ────────────────────────────────────────────────────────

    async def __aenter__(self) -> "OnceHubClient":
        token = _env("ONCEHUB_API_KEY")
        if not token:
            raise RuntimeError("ONCEHUB_API_KEY must be set to talk to OnceHub")
        self._client = httpx.AsyncClient(
            base_url=BASE_URL,
            headers={
                "API-Key": token,
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            timeout=self._timeout,
        )
        return self

    async def __aexit__(self, *_: Any) -> None:
        if self._client:
            await self._client.aclose()

    # ── Config accessors ────────────────────────────────────────────────

    @property
    def page_url(self) -> str:
        url = _env("ONCEHUB_PAGE_URL")
        if not url:
            raise RuntimeError("ONCEHUB_PAGE_URL must be set for the Leslie eLab booking page")
        return url

    @property
    def room_label(self) -> str:
        return _env("ONCEHUB_ROOM_LABEL", DEFAULT_ROOM_LABEL) or DEFAULT_ROOM_LABEL

    @property
    def booking_profile_id(self) -> str:
        profile = _env("ONCEHUB_SHARED_BOOKING_PROFILE_ID")
        if not profile:
            raise RuntimeError(
                "ONCEHUB_SHARED_BOOKING_PROFILE_ID must be set for the shared club booking identity"
            )
        return profile

    # ── Retry helper ─────────────────────────────────────────────────────

    async def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        if self._client is None:
            raise RuntimeError("OnceHubClient must be used inside an async context manager")
        for attempt in range(4):
            resp = await self._client.request(method, path, **kwargs)
            if resp.status_code != 429:
                resp.raise_for_status()
                return resp
            await asyncio.sleep(2**attempt)
        resp.raise_for_status()
        return resp

    # ── Raw transport hooks (tests mock these) ──────────────────────────

    async def _raw_list_slots(
        self,
        *,
        page_url: str,
        year: int,
        month: int,
        duration_minutes: int,
    ) -> list[dict[str, Any]]:
        resp = await self._request(
            "GET",
            "/scheduled_events/availability",
            params={
                "page_url": page_url,
                "year": year,
                "month": month,
                "duration_minutes": duration_minutes,
                "timezone": self._tz_name,
            },
        )
        payload = resp.json()
        raw = payload.get("data") if isinstance(payload, dict) else payload
        return raw if isinstance(raw, list) else []

    async def _raw_submit_booking(self, payload: dict[str, Any]) -> dict[str, Any]:
        resp = await self._request("POST", "/scheduled_events", json=payload)
        body = resp.json()
        return body if isinstance(body, dict) else {"raw": body}

    # ── Room discovery ──────────────────────────────────────────────────

    async def resolve_room(self) -> OnceHubRoom:
        """Return a descriptor for the Leslie eLab Lean/Launchpad room.

        Room identity is pinned by configuration (page URL + label). The
        MVP does not search OnceHub's master room catalog.
        """
        page_url = self.page_url
        label = self.room_label
        link_name = page_url.rstrip("/").rsplit("/", 1)[-1] or label
        return OnceHubRoom(
            room_id=link_name,
            label=label,
            page_url=page_url,
            link_name=link_name,
        )

    # ── Availability ────────────────────────────────────────────────────

    async def list_slots(
        self,
        *,
        start_date: str,
        end_date: str,
        duration_minutes: int,
        preferred_time_window: str | None = None,
    ) -> list[OnceHubSlot]:
        """Return available slots across [start_date, end_date] inclusive.

        The range is broken into month-sized queries so that each OnceHub
        month-view request is independent and the timezone boundary at
        month-start is handled correctly.
        """
        if duration_minutes <= 0:
            raise ValueError("duration_minutes must be positive")

        room = await self.resolve_room()
        start = date.fromisoformat(start_date)
        end = date.fromisoformat(end_date)
        months = _iter_months(start, end)

        entries: list[dict[str, Any]] = []
        for year, month in months:
            entries.extend(
                await self._raw_list_slots(
                    page_url=room.page_url,
                    year=year,
                    month=month,
                    duration_minutes=duration_minutes,
                )
            )

        slots: list[OnceHubSlot] = []
        for entry in entries:
            slot = _parse_slot_entry(
                entry,
                duration_minutes=duration_minutes,
                tz=self._tz,
                room_label=room.label,
                page_url=room.page_url,
            )
            if slot is None:
                continue
            slot_date = date.fromisoformat(slot.display_date)
            if slot_date < start or slot_date > end:
                continue
            if not _within_window(slot, preferred_time_window):
                continue
            slots.append(slot)

        slots.sort(key=lambda s: s.start_epoch_ms)
        return slots

    # ── Booking ─────────────────────────────────────────────────────────

    async def submit_booking(
        self,
        *,
        slot_start_epoch_ms: int,
        duration_minutes: int,
        title: str,
        num_attendees: int,
        description: str | None = None,
        event_type: str | None = None,
        target_profile: str | None = None,
        target_profile_override: str | None = None,
    ) -> OnceHubBookingReceipt:
        """Submit a booking under the shared club booking profile.

        The `target_profile_override` argument is a runtime escape hatch
        for callers that need to swap to a secondary profile at approval
        time; the default is always the env-configured shared profile.
        """
        if duration_minutes <= 0:
            raise ValueError("duration_minutes must be positive")
        if num_attendees <= 0:
            raise ValueError("num_attendees must be positive")

        room = await self.resolve_room()
        profile_id = target_profile_override or self.booking_profile_id

        start_dt = datetime.fromtimestamp(slot_start_epoch_ms / 1000, tz=timezone.utc).astimezone(self._tz)

        payload: dict[str, Any] = {
            "page_url": room.page_url,
            "booking_profile_id": profile_id,
            "start_time": start_dt.isoformat(),
            "duration_minutes": duration_minutes,
            "timezone": self._tz_name,
            "form": {
                "title": title,
                "attendees": num_attendees,
            },
        }
        if description:
            payload["form"]["description"] = description
        if event_type:
            payload["form"]["event_type"] = event_type
        if target_profile:
            payload["form"]["target_profile"] = target_profile

        body = await self._raw_submit_booking(payload)
        reference = (
            body.get("booking_id")
            or body.get("reference")
            or body.get("id")
            or (body.get("data", {}) or {}).get("id")
        )
        status = body.get("status") or body.get("booking_status") or "confirmed"
        return OnceHubBookingReceipt(status=status, booking_reference=reference, raw=body)
