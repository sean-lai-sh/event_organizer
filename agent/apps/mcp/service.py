"""FastMCP server exposing Attio and Convex tools for agent use."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastmcp import FastMCP

try:
    from core.clients.attio import AttioClient, flatten_record
    from core.clients.convex import ConvexClient
    from core.clients.oncehub import (
        LEAN_LAUNCHPAD_ROOM_LABEL,
        ONCEHUB_BASE_URL,
        PROVIDER_NAME as ONCEHUB_PROVIDER,
        OnceHubClient,
        compute_slot_end_epoch_ms,
        format_slot_labels,
    )
except ModuleNotFoundError:  # pragma: no cover - package import fallback
    from agent.core.clients.attio import AttioClient, flatten_record
    from agent.core.clients.convex import ConvexClient
    from agent.core.clients.oncehub import (  # type: ignore
        LEAN_LAUNCHPAD_ROOM_LABEL,
        ONCEHUB_BASE_URL,
        PROVIDER_NAME as ONCEHUB_PROVIDER,
        OnceHubClient,
        compute_slot_end_epoch_ms,
        format_slot_labels,
    )

mcp = FastMCP("event-organizer")


# OnceHub client is resolved lazily so tests can monkeypatch a factory and the
# production path can attach a Playwright backend on first use.
_oncehub_client_factory: Any = None


def _default_oncehub_client() -> OnceHubClient:
    try:
        from core.clients.oncehub_playwright import PlaywrightSlotBackend  # type: ignore
    except ModuleNotFoundError:
        try:
            from agent.core.clients.oncehub_playwright import PlaywrightSlotBackend  # type: ignore
        except ModuleNotFoundError:
            PlaywrightSlotBackend = None  # type: ignore[assignment]
    backend = PlaywrightSlotBackend() if PlaywrightSlotBackend is not None else None
    return OnceHubClient(backend=backend)


def _get_oncehub_client() -> OnceHubClient:
    factory = _oncehub_client_factory or _default_oncehub_client
    return factory()


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


@mcp.tool()
async def find_oncehub_slots(
    start_date: str,
    end_date: str,
    duration_minutes: int = 90,
    preferred_time_window: str | None = None,
) -> dict:
    """
    Return live OnceHub availability for the Leslie eLab Lean/Launchpad room
    between `start_date` and `end_date` (ISO dates, inclusive). Read-only.
    """
    client = _get_oncehub_client()
    slots = await client.find_slots(
        start_date=start_date,
        end_date=end_date,
        duration_minutes=duration_minutes,
        preferred_time_window=preferred_time_window,
    )
    return {
        "provider": ONCEHUB_PROVIDER,
        "room_label": client.room_label,
        "page_url": client.page_url,
        "duration_minutes": duration_minutes,
        "preferred_time_window": preferred_time_window,
        "slots": [slot.to_dict() for slot in slots],
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
    """
    Book the Lean/Launchpad room at the given slot using the shared club profile.

    Write-class tool. MUST be approval-gated by the runtime — the runtime
    injects `approved_by_user_id` after approval and never calls this directly.
    If `event_id` is not provided, a Convex event is created as part of the
    approved write using the booking fields plus the slot's date/time.
    """
    client = _get_oncehub_client()
    booking_result = await client.book_slot(
        slot_start_epoch_ms=slot_start_epoch_ms,
        duration_minutes=duration_minutes,
        title=title,
        num_attendees=num_attendees,
        description=description,
    )

    labels = format_slot_labels(slot_start_epoch_ms, duration_minutes)

    async with ConvexClient() as convex:
        resolved_event_id = event_id
        if not resolved_event_id:
            try:
                resolved_event_id = await convex.create_event({
                    "title": title,
                    "description": description,
                    "event_date": labels["booked_date"],
                    "event_time": labels["booked_time"],
                    "event_end_time": labels["booked_end_time"],
                    "location": client.room_label,
                    "event_type": event_type,
                    "target_profile": target_profile,
                    "needs_outreach": False,
                    "status": "draft",
                })
            except Exception as exc:
                # OnceHub booking already succeeded — surface the reference so
                # ops can reconcile manually.
                raise RuntimeError(
                    "OnceHub booking succeeded but Convex event create failed. "
                    f"Booking reference: {booking_result.booking_reference}. "
                    f"Original error: {exc}"
                ) from exc

        import json as _json
        try:
            await convex.upsert_event_room_booking({
                "event_id": resolved_event_id,
                "provider": ONCEHUB_PROVIDER,
                "page_url": client.page_url,
                "link_name": client.room_label,
                "room_label": client.room_label,
                "booking_status": booking_result.status,
                "booked_date": labels["booked_date"],
                "booked_time": labels["booked_time"],
                "booked_end_time": labels["booked_end_time"],
                "duration_minutes": duration_minutes,
                "slot_start_epoch_ms": slot_start_epoch_ms,
                "booking_reference": booking_result.booking_reference,
                "booking_reference_json": (
                    _json.dumps({"reference": booking_result.booking_reference})
                    if booking_result.booking_reference
                    else None
                ),
                "approver_user_id": approved_by_user_id,
                "raw_response_json": _json.dumps(booking_result.raw_response),
            })
        except Exception as exc:
            raise RuntimeError(
                "OnceHub booking succeeded but Convex upsert failed. "
                f"Booking reference: {booking_result.booking_reference}. "
                f"Original error: {exc}"
            ) from exc

    return {
        "event_id": resolved_event_id,
        "provider": ONCEHUB_PROVIDER,
        "room_label": client.room_label,
        "booking_status": booking_result.status,
        "booking_reference": booking_result.booking_reference,
        "confirmation_url": booking_result.confirmation_url,
        "booked_date": labels["booked_date"],
        "booked_time": labels["booked_time"],
        "booked_end_time": labels["booked_end_time"],
        "duration_minutes": duration_minutes,
        "slot_start_epoch_ms": slot_start_epoch_ms,
        "slot_end_epoch_ms": compute_slot_end_epoch_ms(slot_start_epoch_ms, duration_minutes),
        "display": labels["display"],
    }


@mcp.tool()
async def get_event_room_booking(event_id: str) -> dict | None:
    """Return the stored OnceHub booking record for an event, or None. Read-only."""
    async with ConvexClient() as convex:
        return await convex.get_event_room_booking(event_id)


__all__ = [
    "AttioClient",
    "ConvexClient",
    "LEAN_LAUNCHPAD_ROOM_LABEL",
    "ONCEHUB_BASE_URL",
    "OnceHubClient",
    "book_oncehub_room",
    "create_contact",
    "create_event",
    "find_oncehub_slots",
    "flatten_record",
    "get_attendance_dashboard",
    "get_contact",
    "get_event",
    "get_event_attendance",
    "get_event_inbound_status",
    "get_event_outreach",
    "get_event_room_booking",
    "list_events",
    "mcp",
    "search_contacts",
    "update_contact",
    "update_event_safe",
]
