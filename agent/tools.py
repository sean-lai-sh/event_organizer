"""
Shared clients and helpers for the agent pipeline.

Provides thin wrappers around Convex, AgentMail, Attio, and Anthropic
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

from backend.attio.client import AttioClient, flatten_record  # noqa: E402


# ── Convex ────────────────────────────────────────────────────────────────────

class ConvexClient:
    """Async HTTP client for the Convex deployment.

    Reads CONVEX_URL and CONVEX_DEPLOY_KEY from the environment.
    CONVEX_URL  — e.g. https://happy-animal-123.convex.cloud
    CONVEX_DEPLOY_KEY — deploy key from the Convex dashboard (Settings → Deploy Key)
    """

    def __init__(self) -> None:
        self._url = os.environ["CONVEX_URL"].rstrip("/")
        self._key = os.environ["CONVEX_DEPLOY_KEY"]
        self._http: httpx.AsyncClient | None = None

    async def __aenter__(self) -> ConvexClient:
        self._http = httpx.AsyncClient(
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Convex {self._key}",
            },
            timeout=30.0,
        )
        return self

    async def __aexit__(self, *_: Any) -> None:
        if self._http:
            await self._http.aclose()

    async def _call(self, kind: str, path: str, args: dict) -> Any:
        resp = await self._http.post(
            f"{self._url}/api/{kind}",
            json={"path": path, "args": args, "format": "json"},
        )
        resp.raise_for_status()
        body = resp.json()
        if body.get("status") == "error":
            raise RuntimeError(f"Convex {kind} {path!r} failed: {body.get('errorMessage')}")
        return body.get("value")

    async def query(self, path: str, args: dict | None = None) -> Any:
        return await self._call("query", path, args or {})

    async def mutation(self, path: str, args: dict | None = None) -> Any:
        return await self._call("mutation", path, args or {})

    # ── Events ──

    async def get_event(self, event_id: str) -> dict | None:
        return await self.query("events:getEvent", {"event_id": event_id})

    async def update_event_status(self, event_id: str, status: str) -> None:
        await self.mutation("events:updateEventStatus", {"event_id": event_id, "status": status})

    # ── Event Outreach ──

    async def insert_outreach_rows(self, rows: list[dict]) -> list[str]:
        return await self.mutation("outreach:insertOutreachRows", {"rows": rows})

    async def get_outreach_for_event(
        self, event_id: str, approved: bool | None = None
    ) -> list[dict]:
        args: dict[str, Any] = {"event_id": event_id}
        if approved is not None:
            args["approved"] = approved
        return await self.query("outreach:getOutreachForEvent", args)

    async def update_outreach(
        self, event_id: str, attio_record_id: str, updates: dict
    ) -> None:
        await self.mutation(
            "outreach:updateOutreach",
            {"event_id": event_id, "attio_record_id": attio_record_id, **updates},
        )

    async def approve_contacts(self, event_id: str, record_ids: list[str]) -> None:
        for rid in record_ids:
            await self.update_outreach(event_id, rid, {"approved": True})

    async def find_outreach_by_thread(self, thread_id: str) -> dict | None:
        return await self.query("outreach:findByThread", {"thread_id": thread_id})


# ── Attio helpers ─────────────────────────────────────────────────────────────

async def fetch_enriched_contacts() -> list[dict]:
    """Fetch all people records with enrichment_status=enriched and eligible outreach status."""
    filter_ = {
        "$and": [
            {
                "attribute": {"slug": "enrichment_status"},
                "condition": "equals",
                "value": "enriched",
            },
        ]
    }
    async with AttioClient() as attio:
        records = await attio.search_contacts(filter_, limit=100)

    excluded = {"archived", "paused"}
    result = []
    for r in records:
        flat = flatten_record(r)
        if flat.get("outreach_status") not in excluded:
            result.append({"id": flat["id"], "properties": flat, "_raw": r})
    return result


async def append_attio_note(
    record_id: str, note: str, outreach_status: str | None = None
) -> None:
    """Create a timestamped note on an Attio people record and optionally update outreach_status."""
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    content = f"[{ts}] {note}"

    updates: dict[str, Any] = {
        "last_agent_action_at": [{"value": datetime.now(timezone.utc).isoformat()}],
    }
    if outreach_status:
        updates["outreach_status"] = [{"value": outreach_status}]

    async with AttioClient() as attio:
        await attio.create_note(record_id, title="Agent Note", content=content)
        if updates:
            await attio.update_contact(record_id, updates)


# ── Anthropic LLM ─────────────────────────────────────────────────────────────

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


# ── AgentMail ─────────────────────────────────────────────────────────────────

def get_agentmail_client():
    """Return an AgentMail client instance."""
    from agentmail import AgentMail
    return AgentMail(api_key=os.environ["AGENTMAIL_API_KEY"])
