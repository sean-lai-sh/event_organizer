"""
Attendance insights — summarize imported attendance data and persist a short AI insight.

Manual run:
  modal run agent/insights.py::generate_attendance_insight
"""
from __future__ import annotations

import json
from typing import Any, Callable

import anthropic
import modal

from helper.tools import ConvexClient

app = modal.App("attendance-insights")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("httpx>=0.27", "anthropic>=0.40", "python-dotenv", "pydantic>=2.0")
    .add_local_python_source("helper")
)

SYSTEM_PROMPT = (
    "You are analyzing attendance data for a university student club that hosts "
    "speaker panels, workshops, networking events, and socials. "
    "Give 2-3 concise sentences: (1) what the attendance trend shows with exact numbers, "
    "(2) one plausible hypothesis for why based on event type mix and timing, "
    "(3) one specific actionable suggestion for the next event. "
    "No marketing language. No hedging."
)


def build_insight_payload(
    trends: list[dict[str, Any]],
    stats: dict[str, Any],
    profiles: list[dict[str, Any]],
) -> dict[str, Any]:
    type_breakdown: dict[str, int] = {}
    for trend in trends:
        event_type = str(trend.get("event_type") or "unknown")
        type_breakdown[event_type] = type_breakdown.get(event_type, 0) + 1

    active_count = sum(1 for profile in profiles if profile.get("is_active"))
    top_streaks = sorted(profiles, key=lambda profile: profile.get("streak", 0), reverse=True)[:5]

    return {
        "trends": trends,
        "stats": stats,
        "type_breakdown": type_breakdown,
        "active_ratio": f"{active_count}/{len(profiles)} attendees active",
        "top_streaks": [
            {"email": profile["email"], "streak": profile.get("streak", 0)}
            for profile in top_streaks
        ],
    }


async def _generate_attendance_insight(
    *,
    convex_client_factory: Callable[[], ConvexClient] = ConvexClient,
    anthropic_client_factory: Callable[[], Any] = anthropic.AsyncAnthropic,
) -> dict[str, str]:
    async with convex_client_factory() as convex:
        trends = await convex.get_attendance_trends()
        stats = await convex.get_attendance_stats()
        profiles = await convex.get_attendee_profiles()
        payload = build_insight_payload(trends, stats, profiles)

        client = anthropic_client_factory()
        message = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=256,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": json.dumps(payload)}],
        )
        insight_text = message.content[0].text

        await convex.save_insight(
            insight_text=insight_text,
            data_snapshot=json.dumps(payload),
            event_count=int(stats.get("total_events_tracked", 0)),
            attendee_count=int(stats.get("total_unique_attendees", 0)),
        )

    return {"insight": insight_text}


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("event-outreach-secrets")],
    timeout=120,
)
async def generate_attendance_insight() -> dict:
    return await _generate_attendance_insight()
