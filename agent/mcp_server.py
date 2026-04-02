"""Launcher shim for the FastMCP Attio server."""
from __future__ import annotations

try:
    from apps.mcp import server as _impl
except ModuleNotFoundError:  # pragma: no cover - package import fallback
    from agent.apps.mcp import server as _impl

AttioClient = _impl.AttioClient
flatten_record = _impl.flatten_record
mcp = _impl.mcp


async def search_contacts(
    outreach_status: str | None = None,
    contact_source: str | None = None,
    limit: int = 20,
) -> list[dict]:
    _impl.AttioClient = AttioClient
    return await _impl.search_contacts(
        outreach_status=outreach_status,
        contact_source=contact_source,
        limit=limit,
    )


async def get_contact(record_id: str) -> dict:
    _impl.AttioClient = AttioClient
    return await _impl.get_contact(record_id)


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
    _impl.AttioClient = AttioClient
    return await _impl.create_contact(
        firstname=firstname,
        lastname=lastname,
        email=email,
        contact_source=contact_source,
        contact_type=contact_type,
        career_profile=career_profile,
        warm_intro_by=warm_intro_by,
        assigned_members=assigned_members,
    )


async def update_contact(
    record_id: str,
    outreach_status: str | None = None,
    relationship_stage: str | None = None,
    agent_notes: str | None = None,
    last_agent_action_at: str | None = None,
) -> dict:
    _impl.AttioClient = AttioClient
    return await _impl.update_contact(
        record_id=record_id,
        outreach_status=outreach_status,
        relationship_stage=relationship_stage,
        agent_notes=agent_notes,
        last_agent_action_at=last_agent_action_at,
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


if __name__ == "__main__":
    mcp.run()
