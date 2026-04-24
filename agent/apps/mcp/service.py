"""FastMCP server exposing Attio and Convex tools for agent use."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from fastmcp import FastMCP

try:
    from core.clients.attio import AttioClient, flatten_record
    from core.clients.convex import ConvexClient
    from core.clients.oncehub import OnceHubClient, OnceHubSlot
except ModuleNotFoundError:  # pragma: no cover - package import fallback
    from agent.core.clients.attio import AttioClient, flatten_record
    from agent.core.clients.convex import ConvexClient
    from agent.core.clients.oncehub import OnceHubClient, OnceHubSlot

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


# ── OnceHub Room Booking ────────────────────────────────────────────────

def _slot_to_row(slot: OnceHubSlot) -> dict[str, Any]:
    return slot.to_dict()


@mcp.tool()
async def find_oncehub_slots(
    start_date: str,
    end_date: str,
    duration_minutes: int,
    preferred_time_window: str | None = None,
) -> dict:
    """Return live Leslie eLab Lean/Launchpad availability for a date range.

    Returns a dict with `slots` (list of slot descriptors), `room`, and
    `query` echoing the request. Always live — no caching. This tool is
    read-only and executes without approval.
    """
    async with OnceHubClient() as oncehub:
        room = await oncehub.resolve_room()
        slots = await oncehub.list_slots(
            start_date=start_date,
            end_date=end_date,
            duration_minutes=duration_minutes,
            preferred_time_window=preferred_time_window,
        )
    return {
        "room": {
            "label": room.label,
            "page_url": room.page_url,
            "link_name": room.link_name,
        },
        "query": {
            "start_date": start_date,
            "end_date": end_date,
            "duration_minutes": duration_minutes,
            "preferred_time_window": preferred_time_window,
        },
        "slots": [_slot_to_row(slot) for slot in slots],
    }


@mcp.tool()
async def book_oncehub_room(
    slot_start_epoch_ms: int,
    duration_minutes: int,
    title: str,
    num_attendees: int,
    event_id: str | None = None,
    description: str | None = None,
    event_type: str | None = None,
    target_profile: str | None = None,
    approved_by_user_id: str | None = None,
) -> dict:
    """Book the Leslie eLab Lean/Launchpad room for a specific slot.

    Approval-gated: the runtime pauses before this executes. On approval,
    the booking is submitted to OnceHub under the shared club booking
    profile, and the receipt is persisted to Convex in
    `event_room_bookings`. If `event_id` is provided the event's
    `room_confirmed` milestone is stickied to `true`; if `event_id` is
    omitted a new event is created from the booking details and the
    resulting event id is returned.
    """
    async with OnceHubClient() as oncehub:
        room = await oncehub.resolve_room()
        receipt = await oncehub.submit_booking(
            slot_start_epoch_ms=slot_start_epoch_ms,
            duration_minutes=duration_minutes,
            title=title,
            num_attendees=num_attendees,
            description=description,
            event_type=event_type,
            target_profile=target_profile,
        )
        tz = ZoneInfo(oncehub.tz_name)

    local_start = datetime.fromtimestamp(slot_start_epoch_ms / 1000, tz=timezone.utc).astimezone(tz)
    local_end = local_start + timedelta(minutes=duration_minutes)
    booked_date = local_start.date().isoformat()
    booked_time = local_start.strftime("%-I:%M %p")
    booked_end_time = local_end.strftime("%-I:%M %p")

    # OnceHub has held the slot at this point. Don't raise on Convex failures —
    # the operator needs to see booking_reference to reconcile manually. The
    # three booleans below tell the caller exactly which step (if any) failed.
    event_created = False
    booking_upserted = False
    milestone_set = False
    convex_error: str | None = None
    effective_event_id = event_id

    try:
        async with ConvexClient() as convex:
            if not effective_event_id:
                effective_event_id = await convex.create_event({
                    "title": title,
                    "description": description,
                    "event_date": booked_date,
                    "event_time": booked_time,
                    "event_end_time": booked_end_time,
                    "location": room.label,
                    "event_type": event_type,
                    "target_profile": target_profile,
                    "needs_outreach": False,
                    "status": "draft",
                })
                event_created = True

            await convex.upsert_event_room_booking(
                event_id=effective_event_id,
                provider="oncehub",
                page_url=room.page_url,
                link_name=room.link_name,
                room_label=room.label,
                booking_status=receipt.status,
                booked_date=booked_date,
                booked_time=booked_time,
                booked_end_time=booked_end_time,
                duration_minutes=duration_minutes,
                slot_start_epoch_ms=slot_start_epoch_ms,
                booking_reference=receipt.booking_reference,
                booking_reference_json=(
                    json.dumps({"reference": receipt.booking_reference})
                    if receipt.booking_reference
                    else None
                ),
                approver_user_id=approved_by_user_id,
                raw_response_json=json.dumps(receipt.raw, default=str),
            )
            booking_upserted = True

            await convex.apply_inbound_milestones(
                effective_event_id,
                room_confirmed=True,
            )
            milestone_set = True
    except Exception as exc:
        convex_error = str(exc)

    return {
        "event_id": effective_event_id,
        "event_created": event_created,
        "booking_upserted": booking_upserted,
        "milestone_set": milestone_set,
        "booking_reference": receipt.booking_reference,
        "booking_status": receipt.status,
        "convex_sync": "ok" if convex_error is None else "failed",
        "convex_error": convex_error,
        "room_label": room.label,
        "page_url": room.page_url,
        "booked_date": booked_date,
        "booked_time": booked_time,
        "booked_end_time": booked_end_time,
        "duration_minutes": duration_minutes,
        "slot_start_epoch_ms": slot_start_epoch_ms,
    }


@mcp.tool()
async def get_event_room_booking(event_id: str) -> dict | None:
    """Return the latest OnceHub booking record for a Convex event, or None."""
    async with ConvexClient() as convex:
        return await convex.get_event_room_booking(event_id)


__all__ = [
    "AttioClient",
    "ConvexClient",
    "OnceHubClient",
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
    "create_event",
    "update_event_safe",
    "find_oncehub_slots",
    "book_oncehub_room",
    "get_event_room_booking",
]
