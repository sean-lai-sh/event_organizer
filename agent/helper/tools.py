"""Compatibility helpers for workflows; canonical clients live under core.clients."""
from __future__ import annotations

import os
from datetime import datetime, timezone
from email.utils import parseaddr
from typing import Any

import anthropic

try:
    from core.clients.convex import ConvexClient
    from core.normalize.attio_vocab import normalize_speaker_source, normalize_speaker_status
    from helper.attio import AttioClient, flatten_record, flatten_speaker_entry
except ModuleNotFoundError:  # pragma: no cover - package import fallback
    from agent.core.clients.convex import ConvexClient
    from agent.core.normalize.attio_vocab import normalize_speaker_source, normalize_speaker_status
    from agent.helper.attio import AttioClient, flatten_record, flatten_speaker_entry


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


def _attio_value(value: Any) -> list[dict[str, Any]]:
    return [{"value": value}]


async def _ensure_speaker_entry(
    attio: AttioClient,
    person_record_id: str,
    *,
    source: str | None = None,
    status: str | None = None,
) -> dict:
    rows = await attio.search_speaker_entries(
        {
            "$and": [
                {
                    "attribute": {"slug": "parent_record"},
                    "condition": "equals",
                    "value": person_record_id,
                }
            ]
        },
        limit=1,
    )
    if rows:
        return rows[0]

    values: dict[str, Any] = {
        "parent_record": [{"target_record_id": person_record_id}],
    }
    if source is not None:
        values["source"] = _attio_value(normalize_speaker_source(source))
    if status is not None:
        values["status"] = _attio_value(normalize_speaker_status(status))
    return await attio.create_speaker_entry(values)


async def fetch_enriched_contacts() -> list[dict]:
    """Fetch speaker workflow rows and join each to its parent people record."""
    async with AttioClient() as attio:
        speakers = await attio.search_speaker_entries({}, limit=100)

    result = []
    async with AttioClient() as attio:
        for speaker_row in speakers:
            speaker = flatten_speaker_entry(speaker_row)
            if speaker.get("status") == "Declined":
                continue
            record_id = speaker.get("parent_record_id")
            if not record_id:
                continue
            person_row = await attio.get_contact(record_id)
            person = flatten_record(person_row)
            result.append(
                {
                    "id": person["id"],
                    "speaker_entry_id": speaker.get("entry_id"),
                    "properties": person,
                    "speaker": speaker,
                    "_raw": {"person": person_row, "speaker": speaker_row},
                }
            )
    return result


async def append_attio_note(
    record_id: str, note: str, outreach_status: str | None = None
) -> None:
    """Create a timestamped note on an Attio people record.

    `outreach_status` is accepted only for legacy callers and is intentionally
    ignored; workflow state belongs on Attio `speakers`.
    """
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    content = f"[{ts}] {note}"

    async with AttioClient() as attio:
        await attio.create_note(record_id, title="Agent Note", content=content)


def _split_name(name: str | None) -> tuple[str, str]:
    raw = (name or "").strip()
    if not raw:
        return "Inbound", "Contact"
    parts = raw.split()
    if len(parts) == 1:
        return parts[0], "Contact"
    return parts[0], " ".join(parts[1:])


async def upsert_inbound_contact(email: str, sender_name: str | None = None) -> dict:
    """Find or create an inbound Attio person and ensure a speaker workflow row."""
    email = email.strip().lower()
    if not email:
        raise ValueError("email is required")

    existing_record: dict | None = None
    async with AttioClient() as attio:
        rows = await attio.search_contacts({"email_addresses": {"$eq": email}}, limit=1)
        if rows:
            existing_record = rows[0]

        if existing_record:
            record_id = existing_record.get("id", {}).get("record_id")
            if record_id:
                await _ensure_speaker_entry(
                    attio,
                    record_id,
                    source="in bound",
                    status="Prospect",
                )
            return flatten_record(existing_record)

        parsed_name, parsed_email = parseaddr(sender_name or "")
        inferred_name = parsed_name or sender_name or parsed_email or email
        firstname, lastname = _split_name(inferred_name)
        created = await attio.create_contact(
            {
                "name": [{"first_name": firstname, "last_name": lastname}],
                "email_addresses": [{"email_address": email}],
            }
        )
        record_id = created.get("id", {}).get("record_id")
        if record_id:
            await _ensure_speaker_entry(
                attio,
                record_id,
                source="in bound",
                status="Prospect",
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
