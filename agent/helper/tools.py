"""Compatibility helpers for workflows; canonical clients live under core.clients."""
from __future__ import annotations

import os
from datetime import datetime, timezone
from email.utils import parseaddr
from typing import Any

import anthropic

try:
    from core.clients.convex import ConvexClient
    from helper.attio import AttioClient, flatten_record
except ModuleNotFoundError:  # pragma: no cover - package import fallback
    from agent.core.clients.convex import ConvexClient
    from agent.helper.attio import AttioClient, flatten_record


async def llm_call(system: str, user_prompt: str, max_tokens: int = 1024) -> str:
    """Small compatibility wrapper for Claude text generation calls."""
    client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    msg = await client.messages.create(
        model=os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001"),
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user_prompt}],
    )
    return "".join(
        block.text for block in msg.content if getattr(block, "type", None) == "text"
    ).strip()


def get_agentmail_client():
    """Return an AgentMail client instance."""
    from agentmail import AgentMail

    return AgentMail(api_key=os.environ["AGENTMAIL_API_KEY"])


async def fetch_enriched_contacts() -> list[dict]:
    """Fetch people records with enrichment_status=enriched and non-excluded outreach status."""
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
    for row in records:
        flat = flatten_record(row)
        if flat.get("outreach_status") not in excluded:
            result.append({"id": flat["id"], "properties": flat, "_raw": row})
    return result


async def append_attio_note(
    record_id: str, note: str, outreach_status: str | None = None
) -> None:
    """Create a timestamped note on an Attio people record and optionally update outreach status."""
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
        rows = await attio.search_contacts({"email_addresses": {"$eq": email}}, limit=1)
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


__all__ = [
    "ConvexClient",
    "llm_call",
    "fetch_enriched_contacts",
    "append_attio_note",
    "upsert_inbound_contact",
    "get_agentmail_client",
]
