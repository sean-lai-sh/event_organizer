"""
Shared clients and helpers for the agent pipeline.

Provides thin wrappers around Supabase, AgentMail, HubSpot, and Anthropic
so that match.py, outreach.py, and reply_handler.py stay focused on logic.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

# Allow running from repo root
sys.path.insert(0, str(Path(__file__).parents[1]))
load_dotenv(Path(__file__).parents[1] / "backend" / ".env")

from backend.hubspot.client import HubSpotClient  # noqa: E402

# All custom properties we read from HubSpot contacts
CONTACT_PROPS = [
    "firstname", "lastname", "email", "phone",
    "career_profile", "relationship_stage", "contact_source",
    "warm_intro_by", "assigned_members", "contact_type",
    "outreach_status", "human_notes", "agent_notes",
    "last_agent_action_at", "enrichment_status",
]


# ── Supabase ────────────────────────────────────────────────────────────────

class SupabaseClient:
    """Thin REST wrapper for Supabase PostgREST API."""

    def __init__(self) -> None:
        self.url = os.environ["SUPABASE_URL"].rstrip("/")
        self.key = os.environ["SUPABASE_KEY"]
        self._client = httpx.AsyncClient(
            base_url=f"{self.url}/rest/v1",
            headers={
                "apikey": self.key,
                "Authorization": f"Bearer {self.key}",
                "Content-Type": "application/json",
                "Prefer": "return=representation",
            },
            timeout=30.0,
        )

    async def __aenter__(self) -> SupabaseClient:
        return self

    async def __aexit__(self, *_: Any) -> None:
        await self._client.aclose()

    # ── Events ──

    async def get_event(self, event_id: str) -> dict | None:
        resp = await self._client.get(
            "/events", params={"id": f"eq.{event_id}", "select": "*"}
        )
        resp.raise_for_status()
        rows = resp.json()
        return rows[0] if rows else None

    async def update_event_status(self, event_id: str, status: str) -> None:
        resp = await self._client.patch(
            "/events",
            params={"id": f"eq.{event_id}"},
            content=json.dumps({"status": status}),
        )
        resp.raise_for_status()

    # ── Event Outreach ──

    async def insert_outreach_rows(self, rows: list[dict]) -> list[dict]:
        resp = await self._client.post(
            "/event_outreach", content=json.dumps(rows)
        )
        resp.raise_for_status()
        return resp.json()

    async def get_outreach_for_event(
        self, event_id: str, approved: bool | None = None
    ) -> list[dict]:
        params: dict[str, str] = {
            "event_id": f"eq.{event_id}",
            "select": "*",
        }
        if approved is not None:
            params["approved"] = f"eq.{str(approved).lower()}"
        resp = await self._client.get("/event_outreach", params=params)
        resp.raise_for_status()
        return resp.json()

    async def update_outreach(
        self, event_id: str, hubspot_contact_id: str, updates: dict
    ) -> None:
        resp = await self._client.patch(
            "/event_outreach",
            params={
                "event_id": f"eq.{event_id}",
                "hubspot_contact_id": f"eq.{hubspot_contact_id}",
            },
            content=json.dumps(updates),
        )
        resp.raise_for_status()

    async def approve_contacts(
        self, event_id: str, contact_ids: list[str]
    ) -> None:
        for cid in contact_ids:
            await self.update_outreach(event_id, cid, {"approved": True})

    async def find_outreach_by_thread(self, thread_id: str) -> dict | None:
        resp = await self._client.get(
            "/event_outreach",
            params={
                "agentmail_thread_id": f"eq.{thread_id}",
                "select": "*",
            },
        )
        resp.raise_for_status()
        rows = resp.json()
        return rows[0] if rows else None


# ── HubSpot helpers ─────────────────────────────────────────────────────────

async def fetch_enriched_contacts() -> list[dict]:
    """Fetch all contacts with enrichment_status=enriched and eligible outreach status."""
    filters = [
        {"propertyName": "enrichment_status", "operator": "EQ", "value": "enriched"},
    ]
    async with HubSpotClient() as hs:
        contacts = await hs.search_contacts(
            filters, properties=CONTACT_PROPS, limit=100
        )
    # Exclude archived/paused contacts
    excluded = {"archived", "paused"}
    return [
        c for c in contacts
        if (c.get("properties", {}).get("outreach_status") or "") not in excluded
    ]


async def append_hubspot_notes(
    contact_id: str, note: str, outreach_status: str | None = None
) -> None:
    """Append a timestamped note to a HubSpot contact's agent_notes."""
    async with HubSpotClient() as hs:
        current = await hs.get_contact(contact_id, properties=["agent_notes"])
    existing = (current.get("properties") or {}).get("agent_notes") or ""
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    sep = "\n\n" if existing else ""
    props: dict[str, str] = {
        "agent_notes": f"{existing}{sep}[{ts}] {note}",
        "last_agent_action_at": datetime.now(timezone.utc).isoformat(),
    }
    if outreach_status:
        props["outreach_status"] = outreach_status
    async with HubSpotClient() as hs:
        await hs.update_contact(contact_id, props)


# ── Anthropic LLM ───────────────────────────────────────────────────────────

async def llm_call(system: str, user: str, max_tokens: int = 2048) -> str:
    """Make a single Anthropic API call and return the text response."""
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    message = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return message.content[0].text


# ── AgentMail ───────────────────────────────────────────────────────────────

def get_agentmail_client():
    """Return an AgentMail client instance."""
    from agentmail import AgentMail
    return AgentMail(api_key=os.environ["AGENTMAIL_API_KEY"])
