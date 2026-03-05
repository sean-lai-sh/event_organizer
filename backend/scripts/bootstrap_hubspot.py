"""
One-time bootstrap script: flush stale custom properties from HubSpot
and create the club_contact property group + all 11 custom properties.

Usage:
    python backend/scripts/bootstrap_hubspot.py  (reads from backend/.env)

Requires HUBSPOT_PAT with scope: crm.schemas.contacts.write
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Allow running from repo root without installing the package
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

import httpx

from backend.hubspot.client import HubSpotClient

OBJECT_TYPE = "contacts"
GROUP_NAME = "club_contact"
GROUP_LABEL = "Club Contact"

# Built-in HubSpot group names we never touch
PROTECTED_GROUPS = {
    "contactinformation",
    "email_information",
    "lead_analytics",
    "salesforceinformation",
    "social_information",
    "google_ads_attribution",
    "facebook_ads_properties",
    "emailreplyinfo",
    "hubspot_analytics_information",
    "hubspot_calculated_properties",
    "hubspot_score_properties",
    "hubspot_form_scoring",
    "chatflow_engagement_properties",
    "listmemberships",
    "salesperson",
    "conversations",
}

CUSTOM_PROPERTIES: list[dict] = [
    {
        "name": "career_profile",
        "label": "Career Profile",
        "type": "string",
        "fieldType": "textarea",
        "groupName": GROUP_NAME,
        "description": "JSON string matching CareerProfile schema",
    },
    {
        "name": "relationship_stage",
        "label": "Relationship Stage",
        "type": "enumeration",
        "fieldType": "select",
        "groupName": GROUP_NAME,
        "options": [
            {"label": "Cold", "value": "cold", "displayOrder": 0},
            {"label": "Active", "value": "active", "displayOrder": 1},
            {"label": "Spoken", "value": "spoken", "displayOrder": 2},
            {"label": "Persistent", "value": "persistent", "displayOrder": 3},
        ],
    },
    {
        "name": "contact_source",
        "label": "Contact Source",
        "type": "enumeration",
        "fieldType": "select",
        "groupName": GROUP_NAME,
        "options": [
            {"label": "Warm Intro", "value": "warm_intro", "displayOrder": 0},
            {"label": "Agent Outreach", "value": "agent_outreach", "displayOrder": 1},
            {"label": "Inbound", "value": "inbound", "displayOrder": 2},
            {"label": "Event", "value": "event", "displayOrder": 3},
        ],
    },
    {
        "name": "warm_intro_by",
        "label": "Warm Intro By",
        "type": "string",
        "fieldType": "text",
        "groupName": GROUP_NAME,
        "description": "Name or email of the person who made the warm intro",
    },
    {
        "name": "assigned_members",
        "label": "Assigned Members",
        "type": "string",
        "fieldType": "textarea",
        "groupName": GROUP_NAME,
        "description": "JSON array of eboard member emails assigned to this contact",
    },
    {
        "name": "contact_type",
        "label": "Contact Type",
        "type": "enumeration",
        "fieldType": "select",
        "groupName": GROUP_NAME,
        "options": [
            {"label": "Prospect", "value": "prospect", "displayOrder": 0},
            {"label": "Alumni", "value": "alumni", "displayOrder": 1},
            {"label": "Speaker", "value": "speaker", "displayOrder": 2},
            {"label": "Mentor", "value": "mentor", "displayOrder": 3},
            {"label": "Partner", "value": "partner", "displayOrder": 4},
        ],
    },
    {
        "name": "outreach_status",
        "label": "Outreach Status",
        "type": "enumeration",
        "fieldType": "select",
        "groupName": GROUP_NAME,
        "options": [
            {"label": "Pending", "value": "pending", "displayOrder": 0},
            {"label": "Agent Active", "value": "agent_active", "displayOrder": 1},
            {"label": "Human Assigned", "value": "human_assigned", "displayOrder": 2},
            {"label": "In Conversation", "value": "in_conversation", "displayOrder": 3},
            {"label": "Converted", "value": "converted", "displayOrder": 4},
            {"label": "Paused", "value": "paused", "displayOrder": 5},
            {"label": "Archived", "value": "archived", "displayOrder": 6},
        ],
    },
    {
        "name": "human_notes",
        "label": "Human Notes",
        "type": "string",
        "fieldType": "textarea",
        "groupName": GROUP_NAME,
        "description": "Free-form notes from eboard members",
    },
    {
        "name": "agent_notes",
        "label": "Agent Notes",
        "type": "string",
        "fieldType": "textarea",
        "groupName": GROUP_NAME,
        "description": "Notes written by AI agents during outreach",
    },
    {
        "name": "last_agent_action_at",
        "label": "Last Agent Action",
        "type": "datetime",
        "fieldType": "date",
        "groupName": GROUP_NAME,
        "description": "Timestamp of the last action taken by an agent",
    },
    {
        "name": "enrichment_status",
        "label": "Enrichment Status",
        "type": "enumeration",
        "fieldType": "select",
        "groupName": GROUP_NAME,
        "options": [
            {"label": "Pending", "value": "pending", "displayOrder": 0},
            {"label": "Enriched", "value": "enriched", "displayOrder": 1},
            {"label": "Stale", "value": "stale", "displayOrder": 2},
            {"label": "Failed", "value": "failed", "displayOrder": 3},
        ],
    },
]


async def bootstrap() -> None:
    async with HubSpotClient() as hs:
        # 1. Create property group (idempotent — 409 is OK)
        print(f"Creating property group '{GROUP_NAME}'...")
        result = await hs.create_property_group(OBJECT_TYPE, GROUP_NAME, GROUP_LABEL)
        if result.get("already_exists"):
            print("  Group already exists, continuing.")
        else:
            print(f"  Created: {result.get('name')}")

        # 2. Fetch all existing properties
        print("Fetching existing contact properties...")
        existing = await hs.list_properties(OBJECT_TYPE)
        custom_to_delete = [
            p["name"]
            for p in existing
            if p.get("groupName", "") not in PROTECTED_GROUPS
            and not p.get("hubspotDefined", False)
            and p.get("groupName") == GROUP_NAME
        ]
        print(f"  Found {len(custom_to_delete)} existing club_contact properties to archive.")

        # 3. Archive stale custom properties
        for name in custom_to_delete:
            print(f"  Archiving: {name}")
            await hs.delete_property(OBJECT_TYPE, name)

        # 4. Create custom properties
        print(f"Creating {len(CUSTOM_PROPERTIES)} custom properties...")
        for prop in CUSTOM_PROPERTIES:
            try:
                result = await hs.create_property(OBJECT_TYPE, prop)
                status = "already exists" if result.get("already_exists") else "created"
                print(f"  {prop['name']}: {status}")
            except httpx.HTTPStatusError as e:
                print(f"  ERROR {prop['name']}: {e.response.status_code} — {e.response.text}")

        print("\nBootstrap complete.")
        print(
            "Verify: HubSpot → Contacts → Properties → filter by group 'Club Contact'"
        )


if __name__ == "__main__":
    asyncio.run(bootstrap())
