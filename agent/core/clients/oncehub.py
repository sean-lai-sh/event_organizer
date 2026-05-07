"""Async OnceHub client for Leslie eLab room discovery and booking.

MVP scope (issue #52):
- Room discovery is locked to the Leslie eLab "Lean/Launchpad" room.
- Availability is always fetched live — no caching layer.
- Booking submits under a single shared club booking profile loaded from
  ``agent/config.yaml``.
- Only first-time booking is supported; cancellation/rebooking is out of scope.

The client wraps OnceHub's **internal browser API** (``go.oncehub.com/api/``).
No API key is required — these are the same unauthenticated endpoints that the
AngularJS booking frontend calls.  Concrete endpoint paths are hidden behind
thin wrapper methods (``_raw_list_slots``, ``_raw_submit_booking``) so tests
can mock at the method boundary without spinning up HTTP fakes.
"""
from __future__ import annotations

import asyncio
import calendar
import json
import os
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import httpx
import yaml

# ── Constants ────────────────────────────────────────────────────────────────

BASE_URL = "https://go.oncehub.com/api"
PAGE_URL = "https://go.oncehub.com"

DEFAULT_ROOM_LABEL = "Lean/Launchpad"
DEFAULT_TIMEZONE = "America/New_York"
TIMEZONE_ID = 270  # OnceHub internal ID for US/Eastern
IANA_TZ = DEFAULT_TIMEZONE

_DEFAULT_CONFIG_PATH = Path(__file__).parents[2] / "config.yaml"
_LEGACY_PROFILE_PATH = Path(__file__).with_name("booking_profile.json")

REQUIRED_BOOKING_PROFILE_FIELDS: tuple[str, ...] = (
    "first_name",
    "last_name",
    "email",
    "net_id",
    "organization",
    "graduation_year",
    "location",
    "affiliation_id",
    "school_id",
)

CONFIG_PATH_ENV_VARS: tuple[str, ...] = (
    "EVENT_ORGANIZER_CONFIG_PATH",
    "ONCEHUB_CONFIG_PATH",
)

# ── Data classes ─────────────────────────────────────────────────────────────


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


# ── Helpers ──────────────────────────────────────────────────────────────────


def _env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    return value


def _is_blank_or_placeholder(value: Any) -> bool:
    """Return true when a profile value is missing or still a template marker."""
    if value is None:
        return True
    if not isinstance(value, str):
        return False
    stripped = value.strip()
    return stripped == "" or "FILL_IN" in stripped or stripped.lower() in {
        "todo",
        "tbd",
        "changeme",
    }


def _config_path() -> Path:
    """Return the YAML config path, allowing one deployment-level override."""
    for env_name in CONFIG_PATH_ENV_VARS:
        configured = _env(env_name)
        if configured:
            return Path(configured).expanduser()
    return _DEFAULT_CONFIG_PATH


def _load_config() -> dict[str, Any]:
    """Load agent-level YAML config.

    The default path is ``agent/config.yaml``. ``EVENT_ORGANIZER_CONFIG_PATH``
    or ``ONCEHUB_CONFIG_PATH`` may point Modal at a mounted config file without
    requiring one environment variable per booking-profile field.
    """
    path = _config_path()
    if path.exists():
        with open(path) as f:
            raw = yaml.safe_load(f) or {}
        if not isinstance(raw, dict):
            raise RuntimeError(f"Config file {path} must contain a YAML mapping at the top level.")
        return raw

    if _LEGACY_PROFILE_PATH.exists():
        with open(_LEGACY_PROFILE_PATH) as f:
            legacy_profile = json.load(f)
        return {"oncehub": {"booking_profile": legacy_profile}}

    raise RuntimeError(
        "OnceHub config is missing. Create agent/config.yaml or set "
        "EVENT_ORGANIZER_CONFIG_PATH to a YAML config file."
    )


def _oncehub_config() -> dict[str, Any]:
    raw_oncehub = _load_config().get("oncehub")
    if not isinstance(raw_oncehub, dict):
        raise RuntimeError(
            "OnceHub config is missing. Add an 'oncehub:' section to agent/config.yaml."
        )
    return raw_oncehub


def _config_value(section: dict[str, Any], field: str, default: str | None = None) -> str | None:
    value = section.get(field)
    if _is_blank_or_placeholder(value):
        return default
    return str(value)


def _load_booking_profile() -> dict[str, Any]:
    """Load the shared OnceHub booking identity from YAML config."""
    raw_profile = _oncehub_config().get("booking_profile")
    if not isinstance(raw_profile, dict):
        raise RuntimeError(
            "OnceHub booking profile is missing. Add oncehub.booking_profile to agent/config.yaml."
        )
    return {k: v for k, v in raw_profile.items() if not str(k).startswith("_")}


def _validate_booking_profile(profile: dict[str, Any]) -> None:
    """Fail fast if a real OnceHub booking would use placeholder identity data."""
    missing = [
        field
        for field in REQUIRED_BOOKING_PROFILE_FIELDS
        if _is_blank_or_placeholder(profile.get(field))
    ]
    if missing:
        raise RuntimeError(
            "OnceHub booking profile is incomplete. Fill "
            f"oncehub.booking_profile in {_config_path()} for: {', '.join(missing)}."
        )

    email = str(profile.get("email", "")).strip()
    if "@" not in email or email.startswith("@") or email.endswith("@"):
        raise RuntimeError(
            "OnceHub booking profile email must be a valid email address "
            f"in oncehub.booking_profile.email in {_config_path()}."
        )


def _profile_value(profile: dict[str, Any], field: str, default: str = "") -> str:
    value = profile.get(field)
    if _is_blank_or_placeholder(value):
        return default
    return str(value)


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


def _month_range_ms(year: int, month: int, tz_name: str = DEFAULT_TIMEZONE) -> tuple[int, int]:
    """Return (start_epoch_ms, end_epoch_ms) for an entire calendar month."""
    tz = ZoneInfo(tz_name)
    first = datetime(year, month, 1, tzinfo=tz)
    _, last_day = calendar.monthrange(year, month)
    # End at the last millisecond of the month
    end = datetime(year, month, last_day, 23, 59, 59, 999000, tzinfo=tz)
    return int(first.timestamp() * 1000), int(end.timestamp() * 1000)


def _parse_oncehub_date_key(key: str) -> date | None:
    """Parse OnceHub's 0-indexed-month date keys.

    The internal API returns date keys like ``"2026-3-16"`` which means
    April 16, 2026 (month is 0-indexed).
    """
    try:
        parts = key.split("-")
        return date(int(parts[0]), int(parts[1]) + 1, int(parts[2]))
    except (ValueError, IndexError):
        return None


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


def _within_window(slot: OnceHubSlot, window: str | None) -> bool:
    """Return True if slot's local start time falls in the window.

    Accepted forms:
      - "HH:MM-HH:MM" (24h, local)
      - "morning"  -> 05:00-12:00
      - "afternoon" -> 12:00-17:00
      - "evening"   -> 17:00-22:00
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
    slot_t = slot_dt.timetz().replace(tzinfo=None)
    return start_t <= slot_t < end_t


def _encode_postdata(
    *,
    first_name: str,
    last_name: str,
    email: str,
    net_id: str,
    subject: str,
    event_name: str,
    organization: str,
    num_attendees: str,
    graduation_year: str,
    location: str,
    affiliation_id: str,
    school_id: str,
    pronouns_id: str,
    start_epoch_ms: int,
    duration_minutes: int,
) -> str:
    """Build the ``_so_callback_equal`` / ``_so_cf_list`` encoded string
    that OnceHub expects as the ``postData`` field in
    ``SaveSchedulerInviteeDetails``.
    """
    sep = "_so_callback_equal"
    end = "_so_callback_quote"
    cf_sep = "_so_cf_quote"
    cf_list = "_so_cf_list"

    parts = [
        f"name{sep}{first_name}{end}",
        f"message{sep}{end}",
        f"timezone{sep}{TIMEZONE_ID}{end}",
        f"email{sep}{email}{end}",
        f"subject{sep}{subject}{end}",
        f"duration{sep}{duration_minutes}{end}",
        f"location{sep}{location}{end}",
        f"locationlabel{sep}Location{end}",
        f"meetingtimes{sep}_so_list{start_epoch_ms}_so_quote{duration_minutes}{end}",
        f"postBuffer{sep}30{end}",
        f"preBuffer{sep}30{end}",
        f"meetinglowerboundary{sep}{start_epoch_ms}{end}",
        f"meetingupperboundary{sep}{start_epoch_ms + duration_minutes}{end}",
    ]

    # Custom fields: (libraryId, isSecure, value)
    custom_fields = [
        (60168, "false", last_name),
        (15400, "false", net_id),
        (57698, "false", graduation_year),
        (10734, "false", event_name),
        (10735, "false", organization),
        (10737, "false", num_attendees),
        (10636, "false", f"{affiliation_id}{cf_sep}"),  # dropdown
        (10637, "false", f"{school_id}{cf_sep}"),  # dropdown
    ]
    if pronouns_id:
        custom_fields.append((114071, "false", f"{pronouns_id}{cf_sep}"))

    cf_str = f"customfield{sep}"
    for lib_id, secure, val in custom_fields:
        cf_str += f"{lib_id}{cf_sep}{secure}{cf_sep}{cf_sep}{val}{cf_list}"
    parts.append(cf_str)

    return "".join(parts)


# ── Client ───────────────────────────────────────────────────────────────────


class OnceHubClient:
    """Async client for OnceHub room lookup + booking.

    Uses the **internal browser API** at ``go.oncehub.com/api/``. No API key
    is required. Page, room, and booking-profile settings are loaded from
    ``agent/config.yaml`` so Modal does not need one environment variable per
    identity field.
    """

    def __init__(self, *, timeout: float = 30.0, tz_name: str = DEFAULT_TIMEZONE) -> None:
        self._timeout = timeout
        self._tz_name = tz_name
        self._tz = ZoneInfo(tz_name)
        self._client: httpx.AsyncClient | None = None
        self._room_ids: dict[str, Any] | None = None

    # ── Lifecycle ────────────────────────────────────────────────────────

    async def __aenter__(self) -> "OnceHubClient":
        self._client = httpx.AsyncClient(
            headers={
                "Content-Type": "application/json;charset=UTF-8",
                "Referer": self.page_url,
                "Origin": "https://go.oncehub.com",
                "User-Agent": (
                    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                ),
                "Accept": "application/json",
            },
            timeout=self._timeout,
        )
        # Establish session cookies
        await self._client.get(self.page_url)
        return self

    async def __aexit__(self, *_: Any) -> None:
        if self._client:
            await self._client.aclose()

    # ── Config accessors ────────────────────────────────────────────────

    @property
    def page_url(self) -> str:
        # Keep ONCEHUB_PAGE_URL as a small override for rotations, but prefer YAML.
        url = _env("ONCEHUB_PAGE_URL") or _config_value(_oncehub_config(), "page_url")
        if not url:
            raise RuntimeError("oncehub.page_url must be set in agent/config.yaml")
        return url

    @property
    def link_name(self) -> str:
        """Extract the link name from the page URL (last path segment)."""
        return self.page_url.rstrip("/").rsplit("/", 1)[-1]

    @property
    def room_label(self) -> str:
        return _env("ONCEHUB_ROOM_LABEL") or _config_value(
            _oncehub_config(), "room_label", DEFAULT_ROOM_LABEL
        ) or DEFAULT_ROOM_LABEL

    @property
    def booking_profile(self) -> dict[str, Any]:
        return _load_booking_profile()

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

    # ── Room ID discovery ────────────────────────────────────────────────

    async def _discover_room_ids(self) -> dict[str, Any]:
        """Call the landing page + getbooknow APIs to discover room IDs."""
        if self._room_ids is not None:
            return self._room_ids

        r1 = await self._request(
            "POST",
            f"{BASE_URL}/get-data/GetLandingPageLayout",
            json={"linkName": self.link_name, "tzstring": IANA_TZ},
        )
        bnl_id = r1.json().get("bookNowLinkId")
        theme_id = r1.json().get("returnThemeId", "")

        r2 = await self._request(
            "POST",
            f"{BASE_URL}/get-data/getbooknow",
            json={
                "LinkName": self.link_name,
                "BooknowLinkId": bnl_id,
                "IsServiceFirst": False,
            },
        )
        rooms = r2.json()["bookNowLinkObj"]["meetMeLinkArr"]

        # Find the Lean/Launchpad room (or fall back to the target label)
        target_label = self.room_label.lower()
        room = None
        for r in rooms:
            if target_label in r["label"].lower():
                room = r
                break
        if room is None:
            # Fall back to second room (Lean/Launchpad is typically index 1)
            room = rooms[1] if len(rooms) > 1 else rooms[0]

        self._room_ids = {
            "label": room["label"],
            "settings_id": room["settingsId"],
            "meetme_link_id": room["meetmeLinkId"],
            "owner_user_id": room["ownerUserId"],
            "link_name": room["linkName"],
            "book_now_link_id": bnl_id,
            "category_id": room.get("categoryId", ""),
            "theme_id": theme_id,
        }
        return self._room_ids

    # ── Raw transport hooks (tests mock these) ──────────────────────────

    async def _raw_list_slots(
        self,
        *,
        page_url: str,
        year: int,
        month: int,
        duration_minutes: int,
    ) -> list[dict[str, Any]]:
        """Fetch availability for one calendar month via ``calc-ts``.

        Returns a list of slot dicts with ``start_time`` (ISO) and
        ``start_epoch_ms`` keys, normalised from OnceHub's internal
        0-indexed-month date-keyed format.
        """
        ids = await self._discover_room_ids()
        s_ms, e_ms = _month_range_ms(year, month, tz_name=self._tz_name)

        resp = await self._request(
            "POST",
            f"{BASE_URL}/get-availability/calc-ts",
            json={
                "pooledType": -1,
                "timeZoneId": TIMEZONE_ID,
                "userId": ids["owner_user_id"],
                "settingsId": ids["settings_id"],
                "meetmelinkid": ids["meetme_link_id"],
                "startDate": s_ms,
                "endDate": e_ms,
                "serviceId": -1,
                "teamId": -1,
                "meetingDuration": duration_minutes,
            },
        )
        data = resp.json().get("data", {}).get("slots", {})

        # Flatten the date-keyed structure into a list of slot entries
        entries: list[dict[str, Any]] = []
        for key, day_obj in data.items():
            real_date = _parse_oncehub_date_key(key)
            if real_date is None:
                continue
            for slot in day_obj.get("am", []) + day_obj.get("pm", []):
                epoch_ms = slot["startTime"]
                start_dt = datetime.fromtimestamp(
                    epoch_ms / 1000, tz=timezone.utc
                ).astimezone(self._tz)
                entries.append({
                    "start_time": start_dt.isoformat(),
                    "start_epoch_ms": epoch_ms,
                })
        return entries

    async def _raw_submit_booking(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Submit a booking via ``SaveSchedulerInviteeDetails``."""
        resp = await self._request(
            "POST",
            f"{BASE_URL}/get-data/SaveSchedulerInviteeDetails",
            json=payload,
        )
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
        if end < start:
            raise ValueError("end_date must be on or after start_date")

        ranges = month_ranges(start_date, end_date, tz_name=self._tz_name)

        entries: list[dict[str, Any]] = []
        for year, month, _epoch_ms in ranges:
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
            iso = entry.get("start_time")
            ms = entry.get("start_epoch_ms")
            if iso:
                try:
                    start_dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
                except ValueError:
                    continue
                if start_dt.tzinfo is None:
                    start_dt = start_dt.replace(tzinfo=self._tz)
            elif ms is not None:
                start_dt = datetime.fromtimestamp(int(ms) / 1000, tz=timezone.utc)
            else:
                continue

            slot = _format_slot(
                start_dt=start_dt,
                duration_minutes=duration_minutes,
                tz=self._tz,
                room_label=room.label,
                page_url=room.page_url,
            )
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

        The booking profile is loaded from ``agent/config.yaml``. The
        ``title`` argument overrides the profile's ``subject`` field, and
        ``num_attendees`` overrides the profile's ``num_attendees``.
        """
        if duration_minutes <= 0:
            raise ValueError("duration_minutes must be positive")
        if num_attendees <= 0:
            raise ValueError("num_attendees must be positive")

        ids = await self._discover_room_ids()
        profile = self.booking_profile
        _validate_booking_profile(profile)

        # Build the encoded postData string
        post_data = _encode_postdata(
            first_name=_profile_value(profile, "first_name"),
            last_name=_profile_value(profile, "last_name"),
            email=_profile_value(profile, "email"),
            net_id=_profile_value(profile, "net_id"),
            subject=title,  # Use the booking title as the subject
            event_name=_profile_value(profile, "event_name", title),
            organization=_profile_value(profile, "organization"),
            num_attendees=str(num_attendees),
            graduation_year=_profile_value(profile, "graduation_year"),
            location=_profile_value(profile, "location", "16 Washington Place"),
            affiliation_id=_profile_value(profile, "affiliation_id"),
            school_id=_profile_value(profile, "school_id"),
            pronouns_id=_profile_value(profile, "pronouns_id"),
            start_epoch_ms=slot_start_epoch_ms,
            duration_minutes=duration_minutes,
        )

        payload: dict[str, Any] = {
            "postData": post_data,
            "IANATimeZone": IANA_TZ,
            "sid": ids["settings_id"],
            "userId": ids["owner_user_id"],
            "meetmeLinkId": ids["meetme_link_id"],
            "serviceId": -1,
            "serviceCategoryId": "",
            "bookingPageCategoryId": ids["category_id"],
            "IFParams": {},
            "salesForceBooking": None,
            "bid": None,
            "sn": -1,
            "themeId": ids["theme_id"],
            "e": False,
            "categorySkippedStatus": 1,
            "OneTimeLinkId": None,
            "UtmParameters": {},
            "bookNowLinkId": ids["book_now_link_id"],
        }

        body = await self._raw_submit_booking(payload)

        # Map the response to a receipt
        is_error = body.get("isError", False)
        if is_error:
            return OnceHubBookingReceipt(
                status="error",
                booking_reference=None,
                raw=body,
            )

        reference = (
            body.get("encodedMeetingId")
            or body.get("bookingkey")
            or body.get("booking_id")
            or body.get("reference")
            or body.get("id")
        )
        status = body.get("meetingStatus") or body.get("status") or "confirmed"
        return OnceHubBookingReceipt(
            status=status,
            booking_reference=reference,
            raw=body,
        )
