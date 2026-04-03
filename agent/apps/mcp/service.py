"""FastMCP server exposing Attio and Convex tools for agent use."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastmcp import FastMCP

try:
    from core.clients.attio import AttioClient, flatten_record
    from core.clients.convex import ConvexClient
except ModuleNotFoundError:  # pragma: no cover - package import fallback
    from agent.core.clients.attio import AttioClient, flatten_record
    from agent.core.clients.convex import ConvexClient

mcp = FastMCP("event-organizer")


def _attio_value(v: Any) -> list[dict]:
    return [{"value": v}]


@mcp.tool()
async def search_contacts(
    outreach_status: str | None = None,
    contact_source: str | None = None,
    limit: int = 20,
) -> list[dict]:
    """Search Attio contacts by workflow filters such as source or outreach status."""
    conditions = []
    if outreach_status:
        conditions.append(
            {
                "attribute": {"slug": "outreach_status"},
                "condition": "equals",
                "value": outreach_status,
            }
        )
    if contact_source:
        conditions.append(
            {
                "attribute": {"slug": "contact_source"},
                "condition": "equals",
                "value": contact_source,
            }
        )

    filter_: dict = {"$and": conditions} if conditions else {}

    async with AttioClient() as attio:
        records = await attio.search_contacts(filter_, limit=limit)

    return [flatten_record(r) for r in records]


@mcp.tool()
async def get_contact(record_id: str) -> dict:
    """Fetch one Attio contact by record ID when the specific person is already known."""
    async with AttioClient() as attio:
        record = await attio.get_contact(record_id)
    return flatten_record(record)


@mcp.tool()
async def create_contact(
    firstname: str,
    lastname: str,
    email: str,
    contact_source: str = "agent_outreach",
    contact_type: str = "prospect",
    career_profile: str | None = None,
    warm_intro_by: str | None = None,
    assigned_members: str | None = None,
) -> dict:
    """Create a new Attio contact record with CRM workflow defaults for the agent."""
    values: dict[str, Any] = {
        "name": [{"first_name": firstname, "last_name": lastname}],
        "email_addresses": [{"email_address": email}],
        "contact_source": _attio_value(contact_source),
        "contact_type": _attio_value(contact_type),
        "outreach_status": _attio_value("pending"),
        "enrichment_status": _attio_value("pending"),
        "relationship_stage": _attio_value("cold"),
    }
    if career_profile is not None:
        values["career_profile"] = _attio_value(career_profile)
    if warm_intro_by is not None:
        values["warm_intro_by"] = _attio_value(warm_intro_by)
    if assigned_members is not None:
        values["assigned_members"] = _attio_value(assigned_members)

    async with AttioClient() as attio:
        record = await attio.create_contact(values)
    return flatten_record(record)


@mcp.tool()
async def update_contact(
    record_id: str,
    outreach_status: str | None = None,
    relationship_stage: str | None = None,
    agent_notes: str | None = None,
    last_agent_action_at: str | None = None,
) -> dict:
    """Update one Attio contact and optionally append an agent note for audit history."""
    values: dict[str, Any] = {}

    if outreach_status:
        values["outreach_status"] = _attio_value(outreach_status)
    if relationship_stage:
        values["relationship_stage"] = _attio_value(relationship_stage)

    if agent_notes:
        ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        content = f"[{ts}] {agent_notes}"
        action_ts = last_agent_action_at or datetime.now(timezone.utc).isoformat()
        values["last_agent_action_at"] = _attio_value(action_ts)

        async with AttioClient() as attio:
            await attio.create_note(record_id, title="Agent Note", content=content)
            record = (
                await attio.update_contact(record_id, values)
                if values
                else await attio.get_contact(record_id)
            )
    elif last_agent_action_at:
        values["last_agent_action_at"] = _attio_value(last_agent_action_at)
        async with AttioClient() as attio:
            record = await attio.update_contact(record_id, values)
    else:
        async with AttioClient() as attio:
            record = (
                await attio.update_contact(record_id, values)
                if values
                else await attio.get_contact(record_id)
            )

    return flatten_record(record)


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
async def update_event_safe(
    event_id: str,
    title: str | None = None,
    description: str | None = None,
    event_date: str | None = None,
    event_time: str | None = None,
    event_end_time: str | None = None,
    location: str | None = None,
    status: str | None = None,
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
            speaker_confirmed=speaker_confirmed,
            room_confirmed=room_confirmed,
        )


__all__ = [
    "AttioClient",
    "ConvexClient",
    "flatten_record",
    "mcp",
    "search_contacts",
    "get_contact",
    "create_contact",
    "update_contact",
    "list_events",
    "get_event",
    "get_event_inbound_status",
    "get_event_outreach",
    "get_attendance_dashboard",
    "get_event_attendance",
    "update_event_safe",
]
