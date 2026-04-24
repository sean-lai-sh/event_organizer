"""Compatibility wrapper to the packaged MCP server implementation."""

from .service import (
    AttioClient,
    ConvexClient,
    OnceHubClient,
    book_oncehub_room,
    create_contact,
    create_event,
    find_oncehub_slots,
    flatten_record,
    get_attendance_dashboard,
    get_contact,
    get_event,
    get_event_attendance,
    get_event_inbound_status,
    get_event_outreach,
    get_event_room_booking,
    list_events,
    mcp,
    search_contacts,
    update_contact,
    update_event_safe,
)

__all__ = [
    "AttioClient",
    "ConvexClient",
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


if __name__ == "__main__":
    mcp.run()
