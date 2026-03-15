"""
Shared clients and helpers for the agent pipeline.

Provides thin wrappers around Convex, AgentMail, Attio, and Anthropic
so that match.py, outreach.py, and reply_handler.py stay focused on logic.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from email.utils import parseaddr
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).parents[2] / "backend" / ".env")

from helper.attio import AttioClient, flatten_record


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

    def _strip_nones(self, value: Any) -> Any:
        if isinstance(value, dict):
            return {
                key: self._strip_nones(val)
                for key, val in value.items()
                if val is not None
            }
        if isinstance(value, list):
            return [self._strip_nones(item) for item in value]
        return value

    async def _call(self, kind: str, path: str, args: dict) -> Any:
        resp = await self._http.post(
            f"{self._url}/api/{kind}",
            json={"path": path, "args": self._strip_nones(args), "format": "json"},
        )

        body = resp.text
        print("Convex raw response:", body)

        resp.raise_for_status()

        data = resp.json()
        if data.get("status") == "error":
            raise RuntimeError(data.get("errorMessage"))

        return data.get("value")

    async def query(self, path: str, args: dict | None = None) -> Any:
        return await self._call("query", path, args or {})

    async def mutation(self, path: str, args: dict | None = None) -> Any:
        return await self._call("mutation", path, args or {})

    # ── Events ──

    async def get_event(self, event_id: str) -> dict | None:
        return await self.query("events:getEvent", {"event_id": event_id})

    async def update_event_status(self, event_id: str, status: str) -> None:
        await self.mutation("events:updateEventStatus", {"event_id": event_id, "status": status})

    async def create_event(self, event: dict) -> str:
        return await self.mutation("events:createEvent", event)

    async def apply_inbound_milestones(
        self,
        event_id: str,
        *,
        speaker_confirmed: bool | None = None,
        room_confirmed: bool | None = None,
    ) -> None:
        await self.mutation(
            "events:applyInboundMilestones",
            {
                "event_id": event_id,
                "speaker_confirmed": speaker_confirmed,
                "room_confirmed": room_confirmed,
            },
        )

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

    async def apply_inbound_update(
        self,
        event_id: str,
        attio_record_id: str,
        *,
        classification: str,
        inbound_state: str,
        response: str | None = None,
        sender_email: str | None = None,
        received_at: int | None = None,
    ) -> None:
        await self.mutation(
            "outreach:applyInboundUpdate",
            {
                "event_id": event_id,
                "attio_record_id": attio_record_id,
                "classification": classification,
                "inbound_state": inbound_state,
                "response": response,
                "sender_email": sender_email,
                "received_at": received_at,
            },
        )

    async def upsert_outreach_link(
        self, event_id: str, attio_record_id: str, thread_id: str | None = None
    ) -> str:
        return await self.mutation(
            "outreach:upsertOutreachLink",
            {
                "event_id": event_id,
                "attio_record_id": attio_record_id,
                "thread_id": thread_id,
            },
        )

    async def record_inbound_receipt(self, message_id: str, thread_id: str | None = None) -> bool:
        res = await self.mutation(
            "outreach:recordInboundReceipt",
            {"message_id": message_id, "thread_id": thread_id},
        )
        return bool(res.get("is_duplicate"))

    async def delete_event(self, event_id: str) -> None:
        await self.mutation("events:deleteEvent", {"event_id": event_id})

    async def delete_outreach_for_event(self, event_id: str) -> None:
        await self.mutation("outreach:deleteOutreachForEvent", {"event_id": event_id})

    async def delete_inbound_receipt(self, message_id: str) -> None:
        await self.mutation("outreach:deleteInboundReceipt", {"message_id": message_id})

    # ── Assignments / Eboard ──

    async def get_active_eboard_members(self) -> list[dict]:
        return await self.query("eboard:listActive", {})

    async def resolve_assignees_by_record(self, attio_record_id: str) -> list[dict]:
        return await self.query(
            "contactAssignments:resolveAssigneesByRecord",
            {"attio_record_id": attio_record_id},
        )

    async def upsert_assignments_by_emails(self, attio_record_id: str, emails: list[str]) -> dict:
        return await self.mutation(
            "contactAssignments:upsertAssignmentsByEmails",
            {"attio_record_id": attio_record_id, "emails": emails},
        )


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

    updates: dict[str, Any] = {}
    if outreach_status:
        updates["outreach_status"] = [{"value": outreach_status}]

    async with AttioClient() as attio:
        await attio.create_note(record_id, title="Agent Note", content=content)
        if updates:
            await attio.update_contact(record_id, updates)


def _split_name(name: str | None) -> tuple[str, str]:
    raw = (name or "").strip()
    if not raw:
        return "Inbound", "Contact"
    parts = raw.split()
    if len(parts) == 1:
        return parts[0], "Contact"
    return parts[0], " ".join(parts[1:])


async def upsert_inbound_contact(email: str, sender_name: str | None = None) -> dict:
    """Find or create an inbound Attio contact, using email as the stable key."""
    email = email.strip().lower()
    if not email:
        raise ValueError("email is required")

    existing_record: dict | None = None
    async with AttioClient() as attio:
        rows = await attio.search_contacts(
            {"email_addresses": {"$eq": email}}, limit=1
        )
        if rows:
            existing_record = rows[0]

        if existing_record:
            return flatten_record(existing_record)

        parsed_name, parsed_email = parseaddr(sender_name or "")
        inferred_name = parsed_name or sender_name or parsed_email or email
        firstname, lastname = _split_name(inferred_name)
        created = await attio.create_contact(
            {
                "name": [{"first_name": firstname, "last_name": lastname}],
                "email_addresses": [{"email_address": email}],
                "contact_source": [{"value": "inbound"}],
                "contact_type": [{"value": "prospect"}],
                "outreach_status": [{"value": "pending"}],
                "enrichment_status": [{"value": "pending"}],
                "relationship_stage": [{"value": "cold"}],
            }
        )
        return flatten_record(created)


# ── AgentMail ─────────────────────────────────────────────────────────────────

def get_agentmail_client():
    """Return an AgentMail client instance."""
    from agentmail import AgentMail
    return AgentMail(api_key=os.environ["AGENTMAIL_API_KEY"])
