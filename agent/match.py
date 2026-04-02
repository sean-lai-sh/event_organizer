"""
Phase 1: Match — scan CRM contacts, LLM-rank them for event fit, write suggestions.
"""
from __future__ import annotations

import json

import modal

try:
    from core.modal.config import build_image, secret
    from helper.tools import ConvexClient, fetch_enriched_contacts, llm_call
except ModuleNotFoundError:  # pragma: no cover - package import fallback
    from agent.core.modal.config import build_image, secret
    from agent.helper.tools import ConvexClient, fetch_enriched_contacts, llm_call

app = modal.App("event-outreach-match")

image = build_image()


MATCH_SYSTEM_PROMPT = """\
You are matching contacts to a student club event. For each contact, score them 1-10
for relevance to this event. Consider their career_profile (skills, interests,
experience), contact_type, and the event description/target_profile.

Return valid JSON — an array of objects with these fields:
- attio_record_id: string
- score: integer 1-10
- reasoning: string (1-2 sentences explaining the fit)

Sort by score descending. Only include contacts scoring 5 or above."""


def _build_contact_summary(contact: dict) -> dict:
    props = contact.get("properties", {})
    return {
        "attio_record_id": contact["id"],
        "name": f"{props.get('firstname', '')} {props.get('lastname', '')}".strip(),
        "email": props.get("email", ""),
        "contact_type": props.get("contact_type", ""),
        "career_profile": props.get("career_profile", ""),
        "outreach_status": props.get("outreach_status", ""),
    }


def _build_event_summary(event: dict) -> dict:
    return {
        "title": event.get("title"),
        "description": event.get("description"),
        "event_date": str(event.get("event_date", "")),
        "event_time": str(event.get("event_time", "")),
        "location": event.get("location"),
        "event_type": event.get("event_type"),
        "target_profile": event.get("target_profile"),
    }


@app.function(
    image=image,
    secrets=[secret("match")],
    timeout=120,
)
async def match_contacts_for_event(event_id: str) -> dict:
    async with ConvexClient() as sb:
        event = await sb.get_event(event_id)
    if not event:
        return {"error": f"Event {event_id} not found"}
    if not event.get("needs_outreach", True):
        return {
            "event_id": event_id,
            "suggestions": [],
            "count": 0,
            "note": "Inbound event — no outreach needed",
        }

    contacts = await fetch_enriched_contacts()
    if not contacts:
        return {
            "event_id": event_id,
            "suggestions": [],
            "count": 0,
            "note": "No enriched contacts found",
        }

    event_summary = _build_event_summary(event)
    contact_summaries = [_build_contact_summary(c) for c in contacts]

    user_prompt = (
        f"## Event\n{json.dumps(event_summary, indent=2)}\n\n"
        f"## Contacts ({len(contact_summaries)} total)\n"
        f"{json.dumps(contact_summaries, indent=2)}"
    )

    raw = await llm_call(MATCH_SYSTEM_PROMPT, user_prompt, max_tokens=4096)

    try:
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0]
        suggestions = json.loads(cleaned)
    except json.JSONDecodeError:
        return {"error": "LLM returned invalid JSON", "raw_response": raw}

    outreach_rows = [
        {
            "event_id": event_id,
            "attio_record_id": s["attio_record_id"],
            "suggested": True,
            "approved": False,
            "response": "pending",
        }
        for s in suggestions
    ]

    if outreach_rows:
        async with ConvexClient() as sb:
            await sb.insert_outreach_rows(outreach_rows)
            await sb.update_event_status(event_id, "matching")

    return {
        "event_id": event_id,
        "suggestions": suggestions,
        "count": len(suggestions),
    }


__all__ = ["app", "image", "match_contacts_for_event"]
