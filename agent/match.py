"""
Phase 1: Match — scan CRM contacts, LLM-rank them for event fit, write suggestions.

Trigger: POST /outreach/match { event_id }
Compute: Modal Function
"""
from __future__ import annotations

import json

import modal

from helper.tools import (
    ConvexClient,
    fetch_enriched_contacts,
    llm_call,
)

app = modal.App("event-outreach-match")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("httpx>=0.27", "anthropic>=0.40", "python-dotenv", "pydantic>=2.0")
    .add_local_python_source("helper")
)


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
    """Extract a concise summary from an Attio people record for LLM context."""
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
    """Extract event fields relevant for matching."""
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
    secrets=[modal.Secret.from_name("event-outreach-secrets")],
    timeout=120,
)
async def match_contacts_for_event(event_id: str) -> dict:
    """
    Scan CRM for enriched contacts, LLM-rank them against the event,
    and write suggestions to event_outreach.

    Returns:
        { "event_id": str, "suggestions": [...], "count": int }
    """
    # 1. Read event from Convex
    async with ConvexClient() as sb:
        event = await sb.get_event(event_id)
    if not event:
        return {"error": f"Event {event_id} not found"}
    if not event.get("needs_outreach", True):
        return {"event_id": event_id, "suggestions": [], "count": 0,
                "note": "Inbound event — no outreach needed"}

    # 2. Fetch enriched contacts from Attio
    contacts = await fetch_enriched_contacts()
    if not contacts:
        return {"event_id": event_id, "suggestions": [], "count": 0,
                "note": "No enriched contacts found"}

    # 3. LLM ranks contacts for event fit
    event_summary = _build_event_summary(event)
    contact_summaries = [_build_contact_summary(c) for c in contacts]

    user_prompt = (
        f"## Event\n{json.dumps(event_summary, indent=2)}\n\n"
        f"## Contacts ({len(contact_summaries)} total)\n"
        f"{json.dumps(contact_summaries, indent=2)}"
    )

    raw = await llm_call(MATCH_SYSTEM_PROMPT, user_prompt, max_tokens=4096)

    # Parse LLM response — extract JSON array
    try:
        # Handle potential markdown code fences
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0]
        suggestions = json.loads(cleaned)
    except json.JSONDecodeError:
        return {"error": "LLM returned invalid JSON", "raw_response": raw}

    # 4. Write suggestions to event_outreach
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
            # 5. Update event status
            await sb.update_event_status(event_id, "matching")

    # Attach scores/reasoning to response for the human review UI
    return {
        "event_id": event_id,
        "suggestions": suggestions,
        "count": len(suggestions),
    }
