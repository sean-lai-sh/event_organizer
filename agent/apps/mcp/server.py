"""Compatibility wrapper to root MCP server implementation."""

try:
    from mcp_server import (
        AttioClient,
        create_contact,
        flatten_record,
        get_contact,
        mcp,
        search_contacts,
        update_contact,
    )
except ModuleNotFoundError:  # pragma: no cover - package import fallback
    from agent.mcp_server import (  # type: ignore
        AttioClient,
        create_contact,
        flatten_record,
        get_contact,
        mcp,
        search_contacts,
        update_contact,
    )

__all__ = [
    "AttioClient",
    "flatten_record",
    "mcp",
    "search_contacts",
    "get_contact",
    "create_contact",
    "update_contact",
]
