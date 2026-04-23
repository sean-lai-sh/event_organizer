"""FastMCP server exposing Attio and Convex tools for agent use.

Tool surface is split along the documented canonical contract:

- People tools (`search_people`, `get_person`, `upsert_person`,
  `append_person_note`) operate only on Attio identity/profile fields.
- Speaker tools (`search_speakers`, `get_speaker`,
  `ensure_speaker_for_person`, `update_speaker_workflow`) own the Attio
  `speakers` workflow layer.

`search_contacts` and `get_contact` remain as temporary read-compat aliases
for the people tools so downstream clients and prompts can migrate. The
historical `create_contact` / `update_contact` workflow-authoritative tools
have been retired because they wrote workflow state onto `people`.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastmcp import FastMCP

try:
    from core.clients.attio import (
        AttioClient,
        flatten_record,
        flatten_speaker_entry,
    )
    from core.clients.convex import ConvexClient
    from core.normalize.attio_vocab import (
        normalize_speaker_source,
        normalize_speaker_status,
    )
except ModuleNotFoundError:  # pragma: no cover - package import fallback
    from agent.core.clients.attio import (  # type: ignore
        AttioClient,
        flatten_record,
        flatten_speaker_entry,
    )
    from agent.core.clients.convex import ConvexClient  # type: ignore
    from agent.core.normalize.attio_vocab import (  # type: ignore
        normalize_speaker_source,
        normalize_speaker_status,
    )

mcp = FastMCP("event-organizer")


_PERSON_IDENTITY_FIELDS: frozenset[str] = frozenset(
    {
        "name",
        "email_addresses",
        "phone_numbers",
        "company",
        "job_title",
        "description",
    }
)

_PERSON_FORBIDDEN_WORKFLOW_FIELDS: frozenset[str] = frozenset(
    {
        "outreach_status",
        "contact_source",
        "contact_type",
        "enrichment_status",
        "relationship_stage",
        "assigned_members",
        "career_profile",
        "warm_intro_by",
        "last_agent_action_at",
    }
)


def _attio_value(v: Any) -> list[dict]:
    return [{"value": v}]


def _reject_workflow_fields(values: dict[str, Any]) -> None:
    bad = sorted(k for k in values if k in _PERSON_FORBIDDEN_WORKFLOW_FIELDS)
    if bad:
        raise ValueError(
            "Workflow fields are not allowed on Attio people; move them to "
            f"the speakers workflow tool: {bad}"
        )


# ── People tools (identity only) ─────────────────────────────────────────────


@mcp.tool()
async def search_people(
    email: str | None = None,
    query: str | None = None,
    limit: int = 20,
) -> list[dict]:
    """Search Attio people by identity fields such as email or free-text query."""
    conditions: list[dict] = []
    if email:
        conditions.append(
            {
                "attribute": {"slug": "email_addresses"},
                "condition": "equals",
                "value": email,
            }
        )
    if query:
        conditions.append(
            {
                "attribute": {"slug": "name"},
                "condition": "contains",
                "value": query,
            }
        )
    filter_: dict = {"$and": conditions} if conditions else {}

    async with AttioClient() as attio:
        records = await attio.search_contacts(filter_, limit=limit)

    return [flatten_record(r) for r in records]


@mcp.tool()
async def get_person(record_id: str) -> dict:
    """Fetch one Attio person by record ID when the specific person is already known."""
    async with AttioClient() as attio:
        record = await attio.get_contact(record_id)
    return flatten_record(record)


@mcp.tool()
async def upsert_person(
    firstname: str,
    lastname: str,
    email: str,
    phone: str | None = None,
    company: str | None = None,
    job_title: str | None = None,
    description: str | None = None,
) -> dict:
    """Upsert an Attio person using identity/profile fields only.

    Workflow state (outreach status, source, assignment, relationship stage,
    contact type, etc.) belongs on Attio `speakers` and must be written with
    the speaker workflow tools, not here.
    """
    email = email.strip().lower()
    if not email:
        raise ValueError("email is required")

    values: dict[str, Any] = {
        "name": [{"first_name": firstname, "last_name": lastname}],
        "email_addresses": [{"email_address": email}],
    }
    if phone is not None:
        values["phone_numbers"] = [{"phone_number": phone}]
    if company is not None:
        values["company"] = _attio_value(company)
    if job_title is not None:
        values["job_title"] = _attio_value(job_title)
    if description is not None:
        values["description"] = _attio_value(description)

    _reject_workflow_fields(values)

    async with AttioClient() as attio:
        existing = await attio.search_contacts(
            {"email_addresses": {"$eq": email}}, limit=1
        )
        if existing:
            record_id = existing[0].get("id", {}).get("record_id")
            record = await attio.update_contact(record_id, values)
        else:
            record = await attio.create_contact(values)
    return flatten_record(record)


@mcp.tool()
async def append_person_note(
    record_id: str,
    note: str,
    title: str = "Agent Note",
) -> dict:
    """Append an audit-history note to an Attio person record.

    Notes are the only supported write on `people` beyond identity upserts.
    """
    if not note.strip():
        raise ValueError("note content is required")

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    content = f"[{ts}] {note}"

    async with AttioClient() as attio:
        created = await attio.create_note(record_id, title=title, content=content)

    return {"record_id": record_id, "note": created}


# ── Compatibility read aliases for people ────────────────────────────────────


@mcp.tool()
async def search_contacts(
    email: str | None = None,
    query: str | None = None,
    limit: int = 20,
) -> list[dict]:
    """Compatibility alias for `search_people`; identity-only read access.

    This wrapper exists so existing prompts and clients that still reference
    the legacy `contact` vocabulary keep working. Do not use it for workflow
    filters — use `search_speakers` for workflow-scoped queries.
    """
    return await search_people(email=email, query=query, limit=limit)


@mcp.tool()
async def get_contact(record_id: str) -> dict:
    """Compatibility alias for `get_person`; identity-only read access."""
    return await get_person(record_id)


# ── Speaker tools (workflow layer) ───────────────────────────────────────────


@mcp.tool()
async def search_speakers(
    status: str | None = None,
    source: str | None = None,
    active_event_id: str | None = None,
    limit: int = 20,
) -> list[dict]:
    """Search Attio speaker entries by workflow status, source, or active event."""
    conditions: list[dict] = []
    if status:
        canonical_status = normalize_speaker_status(status)
        conditions.append(
            {
                "attribute": {"slug": "status"},
                "condition": "equals",
                "value": canonical_status,
            }
        )
    if source:
        canonical_source = normalize_speaker_source(source)
        conditions.append(
            {
                "attribute": {"slug": "source"},
                "condition": "equals",
                "value": canonical_source,
            }
        )
    if active_event_id:
        conditions.append(
            {
                "attribute": {"slug": "active_event_id"},
                "condition": "equals",
                "value": active_event_id,
            }
        )

    filter_: dict = {"$and": conditions} if conditions else {}

    async with AttioClient() as attio:
        entries = await attio.search_speaker_entries(filter_, limit=limit)

    return [flatten_speaker_entry(e) for e in entries]


@mcp.tool()
async def get_speaker(speaker_entry_id: str) -> dict:
    """Fetch one Attio speaker workflow entry by its list entry id."""
    async with AttioClient() as attio:
        entry = await attio.get_speaker_entry(speaker_entry_id)
    return flatten_speaker_entry(entry)


@mcp.tool()
async def ensure_speaker_for_person(
    person_record_id: str,
    source: str | None = None,
) -> dict:
    """Return the single MVP speaker entry for a person, creating it if needed.

    MVP contract: exactly one speakers entry per person. If one already exists
    for the given `people.record_id`, it is returned; otherwise a new entry is
    created. `source` is optional and, when provided, must be one of the
    canonical live Attio option titles.
    """
    async with AttioClient() as attio:
        existing = await attio.search_speaker_entries(
            {
                "$and": [
                    {
                        "attribute": {"slug": "parent_record"},
                        "condition": "equals",
                        "value": person_record_id,
                    }
                ]
            },
            limit=1,
        )
        if existing:
            return flatten_speaker_entry(existing[0])

        values: dict[str, Any] = {
            "parent_record": [{"target_record_id": person_record_id}],
        }
        if source is not None:
            values["source"] = _attio_value(normalize_speaker_source(source))

        entry = await attio.create_speaker_entry(values)
    return flatten_speaker_entry(entry)


@mcp.tool()
async def update_speaker_workflow(
    speaker_entry_id: str,
    status: str | None = None,
    source: str | None = None,
    active_event_id: str | None = None,
    assigned: str | None = None,
    managed_poc: str | None = None,
    previous_events: str | None = None,
    speaker_info: str | None = None,
    work_history: str | None = None,
) -> dict:
    """Update workflow fields on an Attio speakers list entry.

    `status` and `source` must use canonical live Attio option titles; guessed
    historical labels are rejected via the normalization layer.
    """
    values: dict[str, Any] = {}
    if status is not None:
        values["status"] = _attio_value(normalize_speaker_status(status))
    if source is not None:
        values["source"] = _attio_value(normalize_speaker_source(source))
    if active_event_id is not None:
        values["active_event_id"] = _attio_value(active_event_id)
    if assigned is not None:
        values["assigned"] = _attio_value(assigned)
    if managed_poc is not None:
        values["managed_poc"] = _attio_value(managed_poc)
    if previous_events is not None:
        values["previous_events"] = _attio_value(previous_events)
    if speaker_info is not None:
        values["speaker_info"] = _attio_value(speaker_info)
    if work_history is not None:
        values["work_history"] = _attio_value(work_history)

    if not values:
        async with AttioClient() as attio:
            entry = await attio.get_speaker_entry(speaker_entry_id)
        return flatten_speaker_entry(entry)

    async with AttioClient() as attio:
        entry = await attio.update_speaker_entry(speaker_entry_id, values)
    return flatten_speaker_entry(entry)


# ── Convex event/attendance tools ────────────────────────────────────────────


@mcp.tool()
async def list_events(status: str | None = None, limit: int = 50) -> list[dict]:
    """List Convex events, typically to find the newest relevant event before a follow-up read."""
    async with ConvexClient() as convex:
        return await convex.list_events(status=status, limit=limit)


@mcp.tool()
async def get_event(event_id: str) -> dict | None:
    """Fetch one Convex event when you already know the event ID."""
    async with ConvexClient() as convex:
        return await convex.get_event(event_id)


@mcp.tool()
async def get_event_inbound_status(event_id: str | None = None) -> list[dict]:
    """Return inbound reply status summaries for one event or all tracked events."""
    async with ConvexClient() as convex:
        return await convex.get_event_inbound_status(event_id=event_id)


@mcp.tool()
async def get_event_outreach(event_id: str, approved: bool | None = None) -> list[dict]:
    """Return per-event outreach rows and responses for a specific Convex event."""
    async with ConvexClient() as convex:
        return await convex.get_outreach_for_event(event_id, approved=approved)


@mcp.tool()
async def get_attendance_dashboard() -> dict:
    """Return aggregate attendance dashboard totals and trends across events."""
    async with ConvexClient() as convex:
        return await convex.get_attendance_dashboard()


@mcp.tool()
async def get_event_attendance(event_id: str) -> dict:
    """Return actual attendance details for one specific event, not aggregate dashboard stats."""
    async with ConvexClient() as convex:
        return await convex.get_event_attendance(event_id)


@mcp.tool()
async def create_event(
    title: str,
    event_date: str,
    status: str = "draft",
    description: str | None = None,
    event_time: str | None = None,
    event_end_time: str | None = None,
    location: str | None = None,
    event_type: str | None = None,
    target_profile: str | None = None,
    needs_outreach: bool = True,
) -> dict:
    """Create a new event with the provided details."""
    async with ConvexClient() as convex:
        event_id = await convex.create_event({
            "title": title,
            "description": description,
            "event_date": event_date,
            "event_time": event_time,
            "event_end_time": event_end_time,
            "location": location,
            "event_type": event_type,
            "target_profile": target_profile,
            "needs_outreach": needs_outreach,
            "status": status,
        })
        return {"event_id": event_id, "title": title}


@mcp.tool()
async def update_event_safe(
    event_id: str,
    title: str | None = None,
    description: str | None = None,
    event_date: str | None = None,
    event_time: str | None = None,
    event_end_time: str | None = None,
    location: str | None = None,
    status: str | None = None,
    event_type: str | None = None,
    target_profile: str | None = None,
    speaker_confirmed: bool | None = None,
    room_confirmed: bool | None = None,
) -> dict | None:
    """Safely patch approved event fields and milestone booleans for a Convex event."""
    async with ConvexClient() as convex:
        return await convex.update_event_safe(
            event_id,
            title=title,
            description=description,
            event_date=event_date,
            event_time=event_time,
            event_end_time=event_end_time,
            location=location,
            status=status,
            event_type=event_type,
            target_profile=target_profile,
            speaker_confirmed=speaker_confirmed,
            room_confirmed=room_confirmed,
        )


__all__ = [
    "AttioClient",
    "ConvexClient",
    "flatten_record",
    "flatten_speaker_entry",
    "mcp",
    # people tools
    "search_people",
    "get_person",
    "upsert_person",
    "append_person_note",
    # compatibility aliases
    "search_contacts",
    "get_contact",
    # speaker tools
    "search_speakers",
    "get_speaker",
    "ensure_speaker_for_person",
    "update_speaker_workflow",
    # convex tools
    "list_events",
    "get_event",
    "get_event_inbound_status",
    "get_event_outreach",
    "get_attendance_dashboard",
    "get_event_attendance",
    "create_event",
    "update_event_safe",
]
