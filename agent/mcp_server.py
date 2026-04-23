"""Compatibility wrapper to the packaged MCP server implementation."""

from apps.mcp.service import (
    AttioClient,
    ConvexClient,
    append_person_note,
    create_event,
    ensure_speaker_for_person,
    flatten_record,
    flatten_speaker_entry,
    get_attendance_dashboard,
    get_contact,
    get_event,
    get_event_attendance,
    get_event_inbound_status,
    get_event_outreach,
    get_person,
    get_speaker,
    list_events,
    mcp,
    search_contacts,
    search_people,
    search_speakers,
    update_event_safe,
    update_speaker_workflow,
    upsert_person,
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


if __name__ == "__main__":
    mcp.run()
