"""Modal deployment for the event-organizer MCP server.

Exposes all MCP tools (Attio, Convex, OnceHub, AgentMail) over streamable
HTTP so the runtime adapter can reach them as a remote MCP endpoint.

Deploy:
    modal deploy agent/apps/mcp/modal_app.py

The resulting endpoint URL should be set as MCP_SERVER_URL in the runtime
environment (or NEXT_PUBLIC_MODAL_ENDPOINT for the frontend).
"""
from __future__ import annotations

import modal

try:
    from core.modal.config import build_image, secret
    from apps.mcp.service import mcp
except ModuleNotFoundError:  # pragma: no cover - package import fallback
    from agent.core.modal.config import build_image, secret  # type: ignore
    from agent.apps.mcp.service import mcp  # type: ignore

app = modal.App("event-mcp-server")

image = build_image(extra_pip=["agentmail", "oncehub"])


@app.function(
    image=image,
    secrets=[secret("mcp")],
    timeout=300,
)
@modal.asgi_app()
def mcp_asgi():
    return mcp.streamable_http_app()
