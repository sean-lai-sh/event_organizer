"""
Smoke test: verify HUBSPOT_PAT works by fetching live data from the HubSpot CRM API.

Usage:
    python backend/scripts/test_hubspot_api.py  (reads HUBSPOT_PAT from backend/.env)

Auth: HubSpot Private App token via hubspot-api-client SDK.
"""
from __future__ import annotations

import os
import json
from pathlib import Path
from dotenv import load_dotenv
from hubspot import HubSpot

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

api_client = HubSpot(access_token=os.environ["HUBSPOT_PAT"])

# 1. Fetch first 5 contacts
print("\n=== Contacts (first 5) ===")
contacts = api_client.crm.contacts.basic_api.get_page(
    limit=5,
    properties=["firstname", "lastname", "email", "relationship_stage", "outreach_status"],
)
if not contacts.results:
    print("  (no contacts found)")
for c in contacts.results:
    p = c.properties
    print(f"  [{c.id}] {p.get('firstname','')} {p.get('lastname','')} <{p.get('email','')}>")
    print(f"         stage={p.get('relationship_stage')}  outreach={p.get('outreach_status')}")

# 2. Verify custom property group exists
print("\n=== club_contact properties ===")
props = api_client.crm.properties.core_api.get_all("contacts")
club_props = [p for p in props.results if p.group_name == "club_contact"]
print(f"  Found {len(club_props)} club_contact properties:")
for p in club_props:
    print(f"  - {p.name} ({p.type})")
