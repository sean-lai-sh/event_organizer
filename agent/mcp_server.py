"""
FastMCP server exposing HubSpot CRM tools for agent use.

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

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

from dotenv import load_dotenv
from fastmcp import FastMCP
from hubspot import HubSpot
from hubspot.crm.contacts.models import (
    SimplePublicObjectInput,
    SimplePublicObjectInputForCreate,
    PublicObjectSearchRequest,
)

load_dotenv(Path(__file__).parents[1] / "backend" / ".env")

_hs = HubSpot(access_token=os.environ["HUBSPOT_PAT"])

mcp = FastMCP("hubspot-crm")

_CONTACT_PROPS = [
    "firstname",
    "lastname",
    "email",
    "phone",
    "career_profile",
    "relationship_stage",
    "contact_source",
    "warm_intro_by",
    "assigned_members",
    "contact_type",
    "outreach_status",
    "human_notes",
    "agent_notes",
    "last_agent_action_at",
    "enrichment_status",
]


@mcp.tool()
def search_contacts(
    outreach_status: str | None = None,
    contact_source: str | None = None,
    limit: int = 20,
) -> list[dict]:
    """
    Search HubSpot contacts by outreach status and/or contact source.

    Args:
        outreach_status: Filter by status — pending | agent_active | human_assigned |
                         in_conversation | converted | paused | archived
        contact_source:  Filter by source — warm_intro | agent_outreach | inbound | event
        limit:           Max results to return (default 20)

    Returns:
        List of contact objects with all club_contact properties.
    """
    filters = []
    if outreach_status:
        filters.append({"propertyName": "outreach_status", "operator": "EQ", "value": outreach_status})
    if contact_source:
        filters.append({"propertyName": "contact_source", "operator": "EQ", "value": contact_source})

    request = PublicObjectSearchRequest(
        filter_groups=[{"filters": filters}],
        properties=_CONTACT_PROPS,
        limit=limit,
    )
    result = _hs.crm.contacts.search_api.do_search(public_object_search_request=request)
    return [c.to_dict() for c in result.results]


@mcp.tool()
def get_contact(contact_id: str) -> dict:
    """
    Retrieve a HubSpot contact by ID with all club_contact properties.

    Args:
        contact_id: HubSpot contact ID (from search_contacts results)

    Returns:
        Contact object with id, properties, and createdAt/updatedAt timestamps.
    """
    result = _hs.crm.contacts.basic_api.get_by_id(
        contact_id, properties=_CONTACT_PROPS
    )
    return result.to_dict()


@mcp.tool()
def create_contact(
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
    Create a new HubSpot contact. Entry point for discovery workflows
    (e.g. LinkedIn browser agent passes serialized CareerProfile JSON here).

    Contact is created with outreach_status=pending and enrichment_status=pending by default.

    Args:
        firstname:        First name
        lastname:         Last name
        email:            Email address (must be unique in HubSpot)
        contact_source:   warm_intro | agent_outreach | inbound | event
        contact_type:     prospect | alumni | speaker | mentor | partner
        career_profile:   JSON string matching CareerProfile schema (optional)
        warm_intro_by:    Name/email of introducer (required if contact_source=warm_intro)
        assigned_members: JSON array of eboard member emails (optional)

    Returns:
        Created contact object with HubSpot ID.
    """
    props: dict = {
        "firstname": firstname,
        "lastname": lastname,
        "email": email,
        "contact_source": contact_source,
        "contact_type": contact_type,
        "outreach_status": "pending",
        "enrichment_status": "pending",
        "relationship_stage": "cold",
    }
    if career_profile is not None:
        props["career_profile"] = career_profile
    if warm_intro_by is not None:
        props["warm_intro_by"] = warm_intro_by
    if assigned_members is not None:
        props["assigned_members"] = assigned_members

    result = _hs.crm.contacts.basic_api.create(
        simple_public_object_input_for_create=SimplePublicObjectInputForCreate(properties=props)
    )
    return result.to_dict()


@mcp.tool()
def update_contact(
    contact_id: str,
    outreach_status: str | None = None,
    relationship_stage: str | None = None,
    agent_notes: str | None = None,
    last_agent_action_at: str | None = None,
) -> dict:
    """
    Update a contact's outreach state and/or append agent notes.

    agent_notes are APPENDED to existing notes (not overwritten), prefixed with
    a UTC timestamp so history is preserved.

    last_agent_action_at defaults to now() if not provided (and agent_notes is set).

    Args:
        contact_id:           HubSpot contact ID
        outreach_status:      New status (optional)
        relationship_stage:   New stage — cold | active | spoken | persistent (optional)
        agent_notes:          Note to append (optional)
        last_agent_action_at: ISO 8601 timestamp override (optional)

    Returns:
        Updated contact object.
    """
    props: dict = {}

    if outreach_status:
        props["outreach_status"] = outreach_status
    if relationship_stage:
        props["relationship_stage"] = relationship_stage

    if agent_notes:
        current = _hs.crm.contacts.basic_api.get_by_id(
            contact_id, properties=["agent_notes"]
        )
        existing = (current.properties or {}).get("agent_notes") or ""
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        separator = "\n\n" if existing else ""
        props["agent_notes"] = f"{existing}{separator}[{timestamp}] {agent_notes}"
        props["last_agent_action_at"] = last_agent_action_at or datetime.now(timezone.utc).isoformat()
    elif last_agent_action_at:
        props["last_agent_action_at"] = last_agent_action_at

    result = _hs.crm.contacts.basic_api.update(
        contact_id,
        simple_public_object_input=SimplePublicObjectInput(properties=props),
    )
    return result.to_dict()


if __name__ == "__main__":
    mcp.run()
