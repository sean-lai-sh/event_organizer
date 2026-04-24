"""
MCP IO + runtime wiring tests for the OnceHub tool surface (issue #52).

These tests avoid touching Playwright or the real Convex deployment. We
monkeypatch the OnceHub client factory and the ConvexClient constructor so the
MCP tools can be exercised as pure async functions.
"""
from __future__ import annotations

import json

import pytest

from apps.mcp import service as mcp_service
from core.clients.oncehub import (
    BookingResult,
    OnceHubClient,
    OnceHubSlot,
    parse_time_slot,
    to_epoch_ms,
)
from runtime.policy import ApprovalPolicy, ToolAction, infer_tool_action_from_tool_name
from runtime.service import _make_approval_title


from datetime import date


# ── Fakes ─────────────────────────────────────────────────────────────────────


class FakeOnceHubBackend:
    def __init__(self, slots=None, booking_result=None) -> None:
        self.slots = slots or []
        self.booking_result = booking_result or BookingResult(
            status="confirmed",
            booking_reference="REF-7",
            confirmation_url="https://go.oncehub.com/x/REF-7",
            raw_response={"booking_reference": "REF-7", "status": "confirmed"},
        )
        self.find_calls = []
        self.book_calls = []

    async def find_slots(self, **kwargs):
        self.find_calls.append(kwargs)
        return list(self.slots)

    async def submit_booking(self, **kwargs):
        self.book_calls.append(kwargs)
        return self.booking_result


class FakeConvexRoomBookings:
    def __init__(self, state: dict) -> None:
        self.state = state

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return None

    async def create_event(self, event: dict) -> str:
        self.state["create_event_calls"].append(event)
        return self.state.get("create_event_result", "evt_new_1")

    async def get_event_room_booking(self, event_id: str):
        self.state["get_calls"].append(event_id)
        return self.state.get("get_result")

    async def upsert_event_room_booking(self, row: dict) -> str:
        self.state["upsert_calls"].append(row)
        if self.state.get("upsert_should_raise"):
            raise RuntimeError("convex down")
        return self.state.get("upsert_result", "rbk_1")


def _install_oncehub_backend(monkeypatch: pytest.MonkeyPatch, backend: FakeOnceHubBackend) -> None:
    def factory():
        return OnceHubClient(backend=backend)
    monkeypatch.setattr(mcp_service, "_oncehub_client_factory", factory, raising=False)


@pytest.fixture
def booking_profile_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Populate the shared OnceHub booking profile env so BookingProfile.from_env()
    returns a valid identity inside tests that exercise `book_oncehub_room`."""
    monkeypatch.setenv("ONCEHUB_PROFILE_FIRST_NAME", "Club")
    monkeypatch.setenv("ONCEHUB_PROFILE_LAST_NAME", "Bot")
    monkeypatch.setenv("ONCEHUB_PROFILE_EMAIL", "club@nyu.edu")
    monkeypatch.setenv("ONCEHUB_PROFILE_NETID", "cb123")
    monkeypatch.setenv("ONCEHUB_PROFILE_AFFILIATION", "Undergrad")
    monkeypatch.setenv("ONCEHUB_PROFILE_SCHOOL", "Tandon")
    monkeypatch.setenv("ONCEHUB_PROFILE_ORG_NAME", "Example Club")


def _install_convex(monkeypatch: pytest.MonkeyPatch, state: dict) -> FakeConvexRoomBookings:
    instance = FakeConvexRoomBookings(state)
    monkeypatch.setattr(mcp_service, "ConvexClient", lambda: instance)
    return instance


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


# ── find_oncehub_slots ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_find_oncehub_slots_returns_serializable_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    _install_oncehub_backend(
        monkeypatch,
        FakeOnceHubBackend(slots=[_slot_at("10:00 AM"), _slot_at("2:00 PM")]),
    )

    payload = await mcp_service.find_oncehub_slots(
        start_date="2026-05-04",
        end_date="2026-05-07",
        duration_minutes=90,
    )

    assert payload["provider"] == "oncehub"
    assert payload["room_label"].startswith("Lean/Launchpad")
    assert payload["duration_minutes"] == 90
    assert len(payload["slots"]) == 2
    json.dumps(payload)  # must be JSON-serializable for MCP


@pytest.mark.asyncio
async def test_find_oncehub_slots_applies_preferred_window(monkeypatch: pytest.MonkeyPatch) -> None:
    _install_oncehub_backend(
        monkeypatch,
        FakeOnceHubBackend(slots=[_slot_at("10:00 AM"), _slot_at("2:00 PM")]),
    )

    payload = await mcp_service.find_oncehub_slots(
        start_date="2026-05-04",
        end_date="2026-05-07",
        duration_minutes=90,
        preferred_time_window="morning",
    )
    assert [s["time_slot"] for s in payload["slots"]] == ["10:00 AM"]


# ── get_event_room_booking ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_event_room_booking_io(monkeypatch: pytest.MonkeyPatch) -> None:
    state = {"create_event_calls": [], "get_calls": [], "upsert_calls": [], "get_result": {"booking_reference": "REF-1"}}
    _install_convex(monkeypatch, state)

    row = await mcp_service.get_event_room_booking("evt_1")

    assert state["get_calls"] == ["evt_1"]
    assert row == {"booking_reference": "REF-1"}


# ── book_oncehub_room ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_book_oncehub_room_creates_event_when_missing(monkeypatch: pytest.MonkeyPatch, booking_profile_env) -> None:
    backend = FakeOnceHubBackend()
    _install_oncehub_backend(monkeypatch, backend)

    state = {"create_event_calls": [], "get_calls": [], "upsert_calls": [], "create_event_result": "evt_new_42"}
    _install_convex(monkeypatch, state)

    slot_ms = to_epoch_ms(parse_time_slot(date(2026, 5, 4), "10:00 AM"))

    result = await mcp_service.book_oncehub_room(
        slot_start_epoch_ms=slot_ms,
        duration_minutes=90,
        title="Startup Panel",
        num_attendees=40,
        event_id=None,
        description="Kickoff",
        event_type="speaker_panel",
        target_profile="early-stage founders",
        approved_by_user_id="user_123",
    )

    assert result["event_id"] == "evt_new_42"
    assert result["booking_status"] == "confirmed"
    assert result["booking_reference"] == "REF-7"
    assert result["booked_date"] == "2026-05-04"
    assert result["booked_time"] == "10:00 AM"
    assert result["booked_end_time"] == "11:30 AM"
    assert result["slot_start_epoch_ms"] == slot_ms
    assert result["slot_end_epoch_ms"] == slot_ms + 90 * 60 * 1000
    assert "Lean/Launchpad" in result["room_label"]

    # Convex event was created with the slot date/time and draft status
    assert len(state["create_event_calls"]) == 1
    created_event = state["create_event_calls"][0]
    assert created_event["title"] == "Startup Panel"
    assert created_event["event_date"] == "2026-05-04"
    assert created_event["event_time"] == "10:00 AM"
    assert created_event["event_end_time"] == "11:30 AM"
    assert created_event["status"] == "draft"
    assert created_event["needs_outreach"] is False

    # Room-booking row was upserted with reference + approver
    assert len(state["upsert_calls"]) == 1
    upsert = state["upsert_calls"][0]
    assert upsert["event_id"] == "evt_new_42"
    assert upsert["provider"] == "oncehub"
    assert upsert["booking_reference"] == "REF-7"
    assert upsert["approver_user_id"] == "user_123"
    assert upsert["duration_minutes"] == 90
    assert upsert["slot_start_epoch_ms"] == slot_ms
    assert "raw_response_json" in upsert
    json.loads(upsert["raw_response_json"])  # is valid JSON


@pytest.mark.asyncio
async def test_book_oncehub_room_reuses_provided_event(monkeypatch: pytest.MonkeyPatch, booking_profile_env) -> None:
    backend = FakeOnceHubBackend()
    _install_oncehub_backend(monkeypatch, backend)

    state = {"create_event_calls": [], "get_calls": [], "upsert_calls": []}
    _install_convex(monkeypatch, state)

    slot_ms = to_epoch_ms(parse_time_slot(date(2026, 5, 4), "10:00 AM"))

    result = await mcp_service.book_oncehub_room(
        slot_start_epoch_ms=slot_ms,
        duration_minutes=90,
        title="Existing",
        num_attendees=12,
        event_id="evt_existing",
        approved_by_user_id="user_x",
    )

    assert result["event_id"] == "evt_existing"
    assert state["create_event_calls"] == []  # no event creation
    assert state["upsert_calls"][0]["event_id"] == "evt_existing"


@pytest.mark.asyncio
async def test_book_oncehub_room_surfaces_convex_failure_with_reference(monkeypatch: pytest.MonkeyPatch, booking_profile_env) -> None:
    backend = FakeOnceHubBackend(
        booking_result=BookingResult(
            status="confirmed",
            booking_reference="REF-BAD-CONVEX",
            confirmation_url=None,
            raw_response={"booking_reference": "REF-BAD-CONVEX"},
        ),
    )
    _install_oncehub_backend(monkeypatch, backend)

    state = {
        "create_event_calls": [],
        "get_calls": [],
        "upsert_calls": [],
        "upsert_should_raise": True,
    }
    _install_convex(monkeypatch, state)

    slot_ms = to_epoch_ms(parse_time_slot(date(2026, 5, 4), "10:00 AM"))

    with pytest.raises(RuntimeError) as exc_info:
        await mcp_service.book_oncehub_room(
            slot_start_epoch_ms=slot_ms,
            duration_minutes=90,
            title="X",
            num_attendees=5,
            event_id="evt_existing",
        )

    message = str(exc_info.value)
    assert "REF-BAD-CONVEX" in message  # reference is surfaced so ops can reconcile
    assert len(backend.book_calls) == 1


# ── Policy wiring ────────────────────────────────────────────────────────────


def test_policy_classifies_find_slots_as_readonly() -> None:
    action = infer_tool_action_from_tool_name("find_oncehub_slots")
    decision = ApprovalPolicy().evaluate(action)
    assert not decision.requires_approval


def test_policy_classifies_get_event_room_booking_as_readonly() -> None:
    action = infer_tool_action_from_tool_name("get_event_room_booking")
    decision = ApprovalPolicy().evaluate(action)
    assert not decision.requires_approval


def test_policy_classifies_book_oncehub_room_as_write() -> None:
    action = infer_tool_action_from_tool_name("book_oncehub_room", payload={"tool_input": {}})
    decision = ApprovalPolicy().evaluate(action)
    assert decision.requires_approval


def test_approval_title_includes_readable_slot_labels() -> None:
    slot_ms = to_epoch_ms(parse_time_slot(date(2026, 5, 4), "10:00 AM"))
    action = ToolAction(
        name="book_oncehub_room",
        action_class=infer_tool_action_from_tool_name("book_oncehub_room").action_class,
        payload={
            "tool_input": {
                "title": "Startup Panel",
                "slot_start_epoch_ms": slot_ms,
                "duration_minutes": 90,
            }
        },
    )
    title = _make_approval_title(action)
    assert "Startup Panel" in title
    assert "Lean/Launchpad" in title
    assert "10:00 AM" in title
    assert "11:30 AM" in title


def test_get_oncehub_client_memoizes_default(monkeypatch: pytest.MonkeyPatch) -> None:
    """Regression guard: the production path must reuse a single OnceHubClient
    across calls so each tool invocation doesn't spin up a fresh Playwright
    session. Tests that install a factory still opt out of memoization."""
    # Drop any cached client from earlier tests or from module import.
    mcp_service._reset_oncehub_client_cache()
    monkeypatch.setattr(mcp_service, "_oncehub_client_factory", None, raising=False)

    first = mcp_service._get_oncehub_client()
    second = mcp_service._get_oncehub_client()
    assert first is second  # memoized

    # With a factory installed, we always get a fresh client so tests can swap
    # in new fakes mid-flight.
    call_count = {"n": 0}

    def _factory():
        call_count["n"] += 1
        return OnceHubClient(backend=FakeOnceHubBackend())

    monkeypatch.setattr(mcp_service, "_oncehub_client_factory", _factory, raising=False)
    a = mcp_service._get_oncehub_client()
    b = mcp_service._get_oncehub_client()
    assert call_count["n"] == 2
    assert a is not b


def test_default_oncehub_client_raises_when_backend_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    """
    Regression guard for the Codex P1 on PR #54: if the Playwright backend
    module cannot be imported, `_default_oncehub_client()` must fail loudly
    rather than hand back an OnceHubClient with `backend=None` that blows up
    deep inside `_resolve_backend()` at first tool call.
    """
    import builtins
    real_import = builtins.__import__

    def _fake_import(name, *args, **kwargs):
        if name.endswith("oncehub_playwright") or name == "core.clients.oncehub_playwright":
            raise ModuleNotFoundError(name)
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", _fake_import)

    with pytest.raises(RuntimeError) as exc:
        mcp_service._default_oncehub_client()

    assert "OnceHub backend module not importable" in str(exc.value)


def test_default_oncehub_client_returns_live_client_when_backend_present() -> None:
    """Happy path: the Playwright backend module exists, so we get a usable client."""
    client = mcp_service._default_oncehub_client()
    assert client.room_label.startswith("Lean/Launchpad")
    # Backend is a real SlotBackend instance, not None.
    assert client._backend is not None  # type: ignore[attr-defined]


def test_approval_title_falls_back_without_slot() -> None:
    action = ToolAction(
        name="book_oncehub_room",
        action_class=infer_tool_action_from_tool_name("book_oncehub_room").action_class,
        payload={"tool_input": {"title": "Startup Panel"}},
    )
    title = _make_approval_title(action)
    assert "Startup Panel" in title
    assert "Lean/Launchpad" in title
