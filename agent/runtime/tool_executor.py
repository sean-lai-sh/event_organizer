from __future__ import annotations

from typing import Any, Awaitable, Callable

try:
    from apps.mcp.service import (
        append_person_note,
        book_oncehub_room,
        create_contact,
        create_event,
        ensure_speaker_for_person,
        find_oncehub_slots,
        get_attendance_dashboard,
        get_contact,
        get_event,
        get_event_attendance,
        get_event_inbound_status,
        get_event_outreach,
        get_event_room_booking,
        get_person,
        get_speaker,
        list_events,
        search_contacts,
        search_people,
        search_speakers,
        update_event_safe,
        update_speaker_workflow,
        upsert_person,
    )
except ModuleNotFoundError:  # pragma: no cover - package import fallback
    from agent.apps.mcp.service import (  # type: ignore
        append_person_note,
        book_oncehub_room,
        create_contact,
        create_event,
        ensure_speaker_for_person,
        find_oncehub_slots,
        get_attendance_dashboard,
        get_contact,
        get_event,
        get_event_attendance,
        get_event_inbound_status,
        get_event_outreach,
        get_event_room_booking,
        get_person,
        get_speaker,
        list_events,
        search_contacts,
        search_people,
        search_speakers,
        update_event_safe,
        update_speaker_workflow,
        upsert_person,
    )

ToolHandler = Callable[..., Awaitable[Any]]

TOOL_HANDLERS: dict[str, ToolHandler] = {
    # people tools (identity only)
    "search_people": search_people,
    "get_person": get_person,
    "upsert_person": upsert_person,
    "append_person_note": append_person_note,
    # compatibility aliases
    "search_contacts": search_contacts,
    "get_contact": get_contact,
    # speaker tools (workflow)
    "search_speakers": search_speakers,
    "get_speaker": get_speaker,
    "ensure_speaker_for_person": ensure_speaker_for_person,
    "update_speaker_workflow": update_speaker_workflow,
    # convex reads + writes
    "list_events": list_events,
    "get_event": get_event,
    "get_event_inbound_status": get_event_inbound_status,
    "get_event_outreach": get_event_outreach,
    "get_attendance_dashboard": get_attendance_dashboard,
    "get_event_attendance": get_event_attendance,
    "create_event": create_event,
    "update_event_safe": update_event_safe,
    "find_oncehub_slots": find_oncehub_slots,
    "book_oncehub_room": book_oncehub_room,
    "get_event_room_booking": get_event_room_booking,
}


async def execute_tool_call(tool_name: str, tool_input: dict[str, Any]) -> Any:
    handler = TOOL_HANDLERS.get(tool_name)
    if handler is None:
        raise ValueError(f"Unsupported MCP tool: {tool_name}")
    return await handler(**tool_input)
