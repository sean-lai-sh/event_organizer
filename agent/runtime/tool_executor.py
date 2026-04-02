from __future__ import annotations

from typing import Any, Awaitable, Callable

try:
    from apps.mcp.service import (
        create_contact,
        get_attendance_dashboard,
        get_contact,
        get_event,
        get_event_attendance,
        get_event_inbound_status,
        get_event_outreach,
        list_events,
        search_contacts,
        update_contact,
        update_event_safe,
    )
except ModuleNotFoundError:  # pragma: no cover - package import fallback
    from agent.apps.mcp.service import (  # type: ignore
        create_contact,
        get_attendance_dashboard,
        get_contact,
        get_event,
        get_event_attendance,
        get_event_inbound_status,
        get_event_outreach,
        list_events,
        search_contacts,
        update_contact,
        update_event_safe,
    )

ToolHandler = Callable[..., Awaitable[Any]]

TOOL_HANDLERS: dict[str, ToolHandler] = {
    "search_contacts": search_contacts,
    "get_contact": get_contact,
    "create_contact": create_contact,
    "update_contact": update_contact,
    "list_events": list_events,
    "get_event": get_event,
    "get_event_inbound_status": get_event_inbound_status,
    "get_event_outreach": get_event_outreach,
    "get_attendance_dashboard": get_attendance_dashboard,
    "get_event_attendance": get_event_attendance,
    "update_event_safe": update_event_safe,
}


async def execute_tool_call(tool_name: str, tool_input: dict[str, Any]) -> Any:
    handler = TOOL_HANDLERS.get(tool_name)
    if handler is None:
        raise ValueError(f"Unsupported MCP tool: {tool_name}")
    return await handler(**tool_input)
