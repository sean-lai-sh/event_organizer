"""Compatibility wrapper to the packaged MCP server implementation."""

from apps.mcp.service import (
    AttioClient,
    ConvexClient,
    create_contact,
    flatten_record,
    get_attendance_dashboard,
    get_event,
    get_event_attendance,
    get_event_inbound_status,
    get_event_outreach,
    get_contact,
    list_events,
    mcp,
    search_contacts,
    update_contact,
    update_event_safe,
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


if __name__ == "__main__":
    mcp.run()
