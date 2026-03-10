"""
FastMCP server exposing Attio CRM tools for agent use.

Lives in /agent — runs as a standalone process (stdio transport), separate from the
backend API service. Can be deployed as a serverless worker or long-running process.

Tools:
  - search_contacts  — find work queue by status/source
  - get_contact      — read full contact details
  - create_contact   — add a new contact (entry point for discovery workflows)
  - update_contact   — log progress, advance status, append agent notes

Run (from repo root):
    python agent/mcp_server.py

Inspect:
    npx @modelcontextprotocol/inspector python agent/mcp_server.py
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parents[1]))

from dotenv import load_dotenv
from fastmcp import FastMCP

load_dotenv(Path(__file__).parents[1] / "backend" / ".env")

from backend.attio.client import AttioClient, flatten_record  # noqa: E402

mcp = FastMCP("attio-crm")


def _attio_value(v: Any) -> list[dict]:
    """Wrap a scalar into Attio's attribute value list format."""
    return [{"value": v}]


@mcp.tool()
async def search_contacts(
    outreach_status: str | None = None,
    contact_source: str | None = None,
    limit: int = 20,
) -> list[dict]:
    """
    Search Attio people records by outreach status and/or contact source.

    Args:
        outreach_status: Filter by status — pending | agent_active | human_assigned |
                         in_conversation | converted | paused | archived
        contact_source:  Filter by source — warm_intro | agent_outreach | inbound | event
        limit:           Max results to return (default 20)

    Returns:
        List of flattened contact dicts with all club attributes.
    """
    conditions = []
    if outreach_status:
        conditions.append({
            "attribute": {"slug": "outreach_status"},
            "condition": "equals",
            "value": outreach_status,
        })
    if contact_source:
        conditions.append({
            "attribute": {"slug": "contact_source"},
            "condition": "equals",
            "value": contact_source,
        })

    filter_: dict = {"$and": conditions} if conditions else {}

    async with AttioClient() as attio:
        records = await attio.search_contacts(filter_, limit=limit)

    return [flatten_record(r) for r in records]


@mcp.tool()
async def get_contact(record_id: str) -> dict:
    """
    Retrieve an Attio people record by ID with all club attributes.

    Args:
        record_id: Attio record ID (from search_contacts results)

    Returns:
        Flattened contact dict with id and all attribute values.
    """
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
    """
    Create a new Attio people record. Entry point for discovery workflows
    (e.g. LinkedIn browser agent passes serialized CareerProfile JSON here).

    Record is created with outreach_status=pending and enrichment_status=pending by default.

    Args:
        firstname:        First name
        lastname:         Last name
        email:            Email address (must be unique in Attio)
        contact_source:   warm_intro | agent_outreach | inbound | event
        contact_type:     prospect | alumni | speaker | mentor | partner
        career_profile:   JSON string matching CareerProfile schema (optional)
        warm_intro_by:    Name/email of introducer (required if contact_source=warm_intro)
        assigned_members: JSON array of eboard member emails (optional)

    Returns:
        Created record as a flattened dict with Attio record ID.
    """
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
    """
    Update a contact's outreach state and/or append agent notes.

    agent_notes are posted as a new timestamped Attio Note (history is preserved
    across multiple note entries).

    last_agent_action_at defaults to now() if not provided (and agent_notes is set).

    Args:
        record_id:            Attio people record ID
        outreach_status:      New status (optional)
        relationship_stage:   New stage — cold | active | spoken | persistent (optional)
        agent_notes:          Note to post (optional)
        last_agent_action_at: ISO 8601 timestamp override (optional)

    Returns:
        Updated record as a flattened dict.
    """
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
            record = await attio.update_contact(record_id, values) if values else await attio.get_contact(record_id)
    elif last_agent_action_at:
        values["last_agent_action_at"] = _attio_value(last_agent_action_at)
        async with AttioClient() as attio:
            record = await attio.update_contact(record_id, values)
    else:
        async with AttioClient() as attio:
            record = await attio.update_contact(record_id, values) if values else await attio.get_contact(record_id)

    return flatten_record(record)


if __name__ == "__main__":
    mcp.run()
