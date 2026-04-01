"""
Tests for attendance insight generation.

These tests are intentionally pure unit tests:
- they use hypothetical attendance data only
- they replace both Convex and Anthropic with in-memory fakes
- they never mutate the real Convex deployment

That makes the suite idempotent by design. Re-running it does not change external
state, and pass/fail/error cases leave the real database untouched.
"""
from __future__ import annotations

import json
from copy import deepcopy
from dataclasses import dataclass, field
from types import SimpleNamespace
from typing import Any

import pytest

from insights import _generate_attendance_insight, build_insight_payload


HYPOTHETICAL_TRENDS = [
    {
        "event_id": "evt_1",
        "title": "AI Founder Panel",
        "event_date": "2026-02-12",
        "event_type": "speaker_panel",
        "attendee_count": 42,
    },
    {
        "event_id": "evt_2",
        "title": "Agent Workshop",
        "event_date": "2026-03-03",
        "event_type": "workshop",
        "attendee_count": 57,
    },
    {
        "event_id": "evt_3",
        "title": "Spring Mixer",
        "event_date": "2026-03-21",
        "event_type": "networking",
        "attendee_count": 31,
    },
]

HYPOTHETICAL_STATS = {
    "total_events_tracked": 3,
    "total_unique_attendees": 83,
    "avg_attendance": 43,
    "top_event": {"title": "Agent Workshop", "count": 57},
}

HYPOTHETICAL_PROFILES = [
    {
        "email": "alex@example.com",
        "streak": 3,
        "is_active": True,
    },
    {
        "email": "sam@example.com",
        "streak": 2,
        "is_active": True,
    },
    {
        "email": "jordan@example.com",
        "streak": 0,
        "is_active": False,
    },
    {
        "email": "casey@example.com",
        "streak": 1,
        "is_active": True,
    },
    {
        "email": "morgan@example.com",
        "streak": 4,
        "is_active": True,
    },
    {
        "email": "jamie@example.com",
        "streak": 1,
        "is_active": False,
    },
]

EXPECTED_INSIGHT = (
    "Attendance climbed from 42 at the panel to 57 at the workshop before settling at 31 for the mixer. "
    "Workshops appear to be the strongest draw in this sample, so the next event should lean into a hands-on AI build format."
)


@dataclass
class FakeConvexState:
    trends: list[dict[str, Any]] = field(default_factory=lambda: deepcopy(HYPOTHETICAL_TRENDS))
    stats: dict[str, Any] = field(default_factory=lambda: deepcopy(HYPOTHETICAL_STATS))
    profiles: list[dict[str, Any]] = field(default_factory=lambda: deepcopy(HYPOTHETICAL_PROFILES))
    saved_payloads: list[dict[str, Any]] = field(default_factory=list)


class FakeConvexClient:
    def __init__(self, state: FakeConvexState) -> None:
        self._state = state

    async def __aenter__(self) -> "FakeConvexClient":
        return self

    async def __aexit__(self, *_: Any) -> None:
        return None

    async def get_attendance_trends(self) -> list[dict[str, Any]]:
        return deepcopy(self._state.trends)

    async def get_attendance_stats(self) -> dict[str, Any]:
        return deepcopy(self._state.stats)

    async def get_attendee_profiles(self) -> list[dict[str, Any]]:
        return deepcopy(self._state.profiles)

    async def save_insight(
        self,
        *,
        insight_text: str,
        data_snapshot: str,
        event_count: int,
        attendee_count: int,
    ) -> None:
        self._state.saved_payloads.append(
            {
                "insight_text": insight_text,
                "data_snapshot": data_snapshot,
                "event_count": event_count,
                "attendee_count": attendee_count,
            }
        )


class FakeAnthropicClient:
    def __init__(self, response_text: str = EXPECTED_INSIGHT) -> None:
        self.calls: list[dict[str, Any]] = []
        self.messages = SimpleNamespace(create=self._create)
        self._response_text = response_text

    async def _create(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        return SimpleNamespace(content=[SimpleNamespace(text=self._response_text)])


class ExplodingAnthropicClient(FakeAnthropicClient):
    async def _create(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        raise RuntimeError("anthropic unavailable")


@pytest.fixture
def fake_state() -> FakeConvexState:
    return FakeConvexState()


@pytest.fixture
def convex_factory(fake_state: FakeConvexState):
    def factory() -> FakeConvexClient:
        return FakeConvexClient(fake_state)

    return factory


def test_build_insight_payload_from_hypothetical_data() -> None:
    payload = build_insight_payload(
        trends=deepcopy(HYPOTHETICAL_TRENDS),
        stats=deepcopy(HYPOTHETICAL_STATS),
        profiles=deepcopy(HYPOTHETICAL_PROFILES),
    )

    assert payload["type_breakdown"] == {
        "speaker_panel": 1,
        "workshop": 1,
        "networking": 1,
    }
    assert payload["active_ratio"] == "4/6 attendees active"
    assert payload["top_streaks"] == [
        {"email": "morgan@example.com", "streak": 4},
        {"email": "alex@example.com", "streak": 3},
        {"email": "sam@example.com", "streak": 2},
        {"email": "casey@example.com", "streak": 1},
        {"email": "jamie@example.com", "streak": 1},
    ]


async def test_generate_attendance_insight_saves_expected_snapshot(
    fake_state: FakeConvexState,
    convex_factory,
) -> None:
    anthropic_client = FakeAnthropicClient()

    result = await _generate_attendance_insight(
        convex_client_factory=convex_factory,
        anthropic_client_factory=lambda: anthropic_client,
    )

    assert result == {"insight": EXPECTED_INSIGHT}
    assert len(fake_state.saved_payloads) == 1

    saved = fake_state.saved_payloads[0]
    assert saved["insight_text"] == EXPECTED_INSIGHT
    assert saved["event_count"] == 3
    assert saved["attendee_count"] == 83

    snapshot = json.loads(saved["data_snapshot"])
    assert snapshot == build_insight_payload(
        trends=deepcopy(HYPOTHETICAL_TRENDS),
        stats=deepcopy(HYPOTHETICAL_STATS),
        profiles=deepcopy(HYPOTHETICAL_PROFILES),
    )

    assert len(anthropic_client.calls) == 1
    assert anthropic_client.calls[0]["model"] == "claude-haiku-4-5-20251001"


async def test_generate_attendance_insight_is_test_idempotent() -> None:
    first_state = FakeConvexState()
    second_state = FakeConvexState()

    first_client = FakeAnthropicClient()
    second_client = FakeAnthropicClient()

    first_result = await _generate_attendance_insight(
        convex_client_factory=lambda: FakeConvexClient(first_state),
        anthropic_client_factory=lambda: first_client,
    )
    second_result = await _generate_attendance_insight(
        convex_client_factory=lambda: FakeConvexClient(second_state),
        anthropic_client_factory=lambda: second_client,
    )

    assert first_result == second_result == {"insight": EXPECTED_INSIGHT}
    assert first_state.saved_payloads == second_state.saved_payloads
    assert first_state.trends == HYPOTHETICAL_TRENDS
    assert second_state.trends == HYPOTHETICAL_TRENDS


async def test_generate_attendance_insight_does_not_save_on_model_error(
    fake_state: FakeConvexState,
    convex_factory,
) -> None:
    anthropic_client = ExplodingAnthropicClient()

    with pytest.raises(RuntimeError, match="anthropic unavailable"):
        await _generate_attendance_insight(
            convex_client_factory=convex_factory,
            anthropic_client_factory=lambda: anthropic_client,
        )

    assert fake_state.saved_payloads == []
