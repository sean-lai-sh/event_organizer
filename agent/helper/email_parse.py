from __future__ import annotations

import json
import os
import re
from email.utils import parseaddr
from pathlib import Path
from typing import Any

import anthropic

from helper.tools import (
    ConvexClient,
    append_attio_note,
    get_agentmail_client,
    upsert_inbound_contact,
)

# ── Prompts ───────────────────────────────────────────────────────────────────

_PROMPTS = Path(__file__).parent / "prompts"

KNOWN_THREAD_PROMPT = (_PROMPTS / "known_thread.txt").read_text()
NET_NEW_PROMPT = (_PROMPTS / "net_new.txt").read_text()

# ── Email field parsing ───────────────────────────────────────────────────────

def normalize_email(value: str) -> str:
    return value.strip().lower()


def extract_first_email(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        _, email = parseaddr(value)
        return normalize_email(email) if email else None
    if isinstance(value, dict):
        for key in ("email", "email_address", "address", "from"):
            if isinstance(value.get(key), str):
                return extract_first_email(value.get(key))
    if isinstance(value, list):
        for item in value:
            email = extract_first_email(item)
            if email:
                return email
    return None


def extract_email_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        chunks = [c.strip() for c in value.split(",") if c.strip()]
        return [e for e in (extract_first_email(c) for c in chunks) if e]
    if isinstance(value, dict):
        single = extract_first_email(value)
        return [single] if single else []
    if isinstance(value, list):
        out: list[str] = []
        for item in value:
            out.extend(extract_email_list(item))
        return list(dict.fromkeys(out))
    return []

# ── LLM helpers ───────────────────────────────────────────────────────────────

def _clean_json(raw: str) -> dict:
    cleaned = (raw or "").strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0]
    return json.loads(cleaned)


def _normalize_decision(raw: dict) -> dict:
    classification = str(raw.get("classification", "NEEDS_HUMAN")).upper()
    if classification not in {"ACCEPTED", "DECLINED", "QUESTION", "NEEDS_HUMAN"}:
        classification = "NEEDS_HUMAN"
    extract = raw.get("event_extract")
    return {
        "classification": classification,
        "reasoning": str(raw.get("reasoning", "")),
        "speaker_confirmed": bool(raw.get("speaker_confirmed", False)),
        "room_confirmed": bool(raw.get("room_confirmed", False)),
        "event_signal": bool(raw.get("event_signal", False)),
        "timing_signal": bool(raw.get("timing_signal", False)),
        "event_extract": extract if isinstance(extract, dict) else {},
    }


async def classify_known_thread(
    *, sender_email: str, body: str, event: dict | None, thread_messages: list[dict],
) -> dict:
    event_context = json.dumps({
        "title": event.get("title") if event else "Unknown",
        "event_date": str(event.get("event_date", "")) if event else "",
        "location": event.get("location") if event else "",
        "description": event.get("description") if event else "",
    })
    user_prompt = (
        f"## Event\n{event_context}\n\n"
        f"## Thread history\n{json.dumps(thread_messages, indent=2)}\n\n"
        f"## Latest reply\nFrom: {sender_email}\n{body}"
    )
    try:
        client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        msg = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            system=KNOWN_THREAD_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )
        return _normalize_decision(_clean_json(msg.content[0].text))
    except Exception:
        return _normalize_decision({"classification": "NEEDS_HUMAN", "reasoning": "LLM parse failure"})


async def classify_net_new(
    *, sender_email: str, subject: str, body: str, to_emails: list[str], cc_emails: list[str],
) -> dict:
    user_prompt = (
        f"## Message\n"
        f"From: {sender_email}\nTo: {to_emails}\nCc: {cc_emails}\nSubject: {subject}\n\n"
        f"{body}"
    )
    try:
        client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        msg = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            system=NET_NEW_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )
        return _normalize_decision(_clean_json(msg.content[0].text))
    except Exception:
        return _normalize_decision({})

# ── Convex side-effect helpers ────────────────────────────────────────────────

_DATE_RE = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")


def to_workflow_state(classification: str) -> tuple[str, str]:
    if classification == "ACCEPTED":
        return "accepted", "resolved"
    if classification == "DECLINED":
        return "declined", "resolved"
    if classification == "QUESTION":
        return "pending", "awaiting_member_reply"
    return "pending", "needs_review"


def _sanitize_event_date(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    val = value.strip()
    return val if _DATE_RE.fullmatch(val) else None


def build_event_payload(extract: dict, subject: str, created_by: str | None) -> dict:
    title = (extract.get("title") or subject or "Inbound Event Opportunity").strip()
    return {
        "title": title[:140],
        "description": (extract.get("description") or "Auto-created from inbound email").strip(),
        "event_date": _sanitize_event_date(extract.get("date")),
        "event_time": extract.get("time") or None,
        "event_end_time": None,
        "location": extract.get("location") or None,
        "event_type": None,
        "target_profile": None,
        "needs_outreach": False,
        "status": "draft",
        "created_by": created_by,
    }


async def resolve_owner_emails(
    sb: ConvexClient,
    *,
    attio_record_id: str,
    event: dict | None,
    to_emails: list[str],
    cc_emails: list[str],
) -> list[str]:
    existing = await sb.resolve_assignees_by_record(attio_record_id)
    existing_emails = [
        normalize_email(str(item.get("email")))
        for item in existing
        if item.get("email")
    ]
    if existing_emails:
        return list(dict.fromkeys(existing_emails))

    active = await sb.get_active_eboard_members()
    active_set = {normalize_email(str(item.get("email"))) for item in active if item.get("email")}
    candidates = {normalize_email(x) for x in (to_emails + cc_emails)}
    matched = sorted(candidates & active_set)
    if matched:
        await sb.upsert_assignments_by_emails(attio_record_id, matched)
        return matched

    fallback = (event or {}).get("created_by")
    if isinstance(fallback, str) and fallback.strip():
        owner = normalize_email(fallback)
        await sb.upsert_assignments_by_emails(attio_record_id, [owner])
        return [owner]
    return []


def log_and_return(data: dict) -> dict:
    print(json.dumps(data))
    return {"status": "processed", **data}

# ── Path handlers ─────────────────────────────────────────────────────────────

async def handle_known_thread(
    *,
    outreach: dict,
    sender_email: str,
    body: str,
    to_emails: list[str],
    cc_emails: list[str],
    thread_id: str | None,
) -> dict:
    event_id = outreach["event_id"]
    record_id = outreach["attio_record_id"]

    agentmail = get_agentmail_client()
    try:
        thread = agentmail.threads.get(thread_id)
        thread_messages = [
            {"from": getattr(m, "from_", ""), "text": getattr(m, "text", "")}
            for m in getattr(thread, "messages", [])
        ]
    except Exception:
        thread_messages = []

    async with ConvexClient() as sb:
        event = await sb.get_event(event_id)
        decision = await classify_known_thread(
            sender_email=sender_email, body=body, event=event, thread_messages=thread_messages,
        )
        response, inbound_state = to_workflow_state(decision["classification"])
        await sb.apply_inbound_update(
            event_id, record_id,
            classification=decision["classification"],
            inbound_state=inbound_state,
            response=response,
            sender_email=sender_email,
        )
        await sb.apply_inbound_milestones(
            event_id,
            speaker_confirmed=decision["speaker_confirmed"],
            room_confirmed=decision["room_confirmed"],
        )
        owner_emails = await resolve_owner_emails(
            sb, attio_record_id=record_id, event=event, to_emails=to_emails, cc_emails=cc_emails,
        )

    await append_attio_note(
        record_id,
        f"Inbound processed (known thread). classification={decision['classification']} "
        f"state={inbound_state} speaker_confirmed={decision['speaker_confirmed']} "
        f"room_confirmed={decision['room_confirmed']} owners={owner_emails}",
    )
    return log_and_return({
        "path": "known_thread",
        "thread_id": thread_id,
        "event_id": event_id,
        "record_id": record_id,
        "classification": decision["classification"],
        "inbound_state": inbound_state,
        "reasoning": decision["reasoning"],
    })


async def handle_net_new(
    *,
    sender_email: str,
    sender_name: str,
    subject: str,
    body: str,
    to_emails: list[str],
    cc_emails: list[str],
    thread_id: str | None,
) -> dict:
    contact = await upsert_inbound_contact(sender_email, sender_name=sender_name)
    record_id = contact.get("id")

    decision = await classify_net_new(
        sender_email=sender_email, subject=subject, body=body,
        to_emails=to_emails, cc_emails=cc_emails,
    )

    if not record_id:
        return log_and_return({
            "path": "net_new", "event_created": False,
            "classification": decision["classification"], "reasoning": decision["reasoning"],
        })

    if not (decision["event_signal"] and decision["timing_signal"]):
        await append_attio_note(
            record_id,
            f"Inbound captured (net-new), insufficient signal for auto-create. "
            f"classification={decision['classification']} "
            f"event_signal={decision['event_signal']} timing_signal={decision['timing_signal']}",
        )
        return log_and_return({
            "path": "net_new", "record_id": record_id, "event_created": False,
            "event_signal": decision["event_signal"], "timing_signal": decision["timing_signal"],
            "classification": decision["classification"], "reasoning": decision["reasoning"],
        })

    async with ConvexClient() as sb:
        owner_emails = await resolve_owner_emails(
            sb, attio_record_id=record_id, event=None, to_emails=to_emails, cc_emails=cc_emails,
        )
        event_id = await sb.create_event(
            build_event_payload(decision["event_extract"], subject=subject, created_by=owner_emails[0] if owner_emails else None)
        )
        await sb.upsert_outreach_link(event_id, record_id, thread_id=thread_id)
        response, inbound_state = to_workflow_state(decision["classification"])
        await sb.apply_inbound_update(
            event_id, record_id,
            classification=decision["classification"],
            inbound_state=inbound_state,
            response=response,
            sender_email=sender_email,
        )
        await sb.apply_inbound_milestones(
            event_id,
            speaker_confirmed=decision["speaker_confirmed"],
            room_confirmed=decision["room_confirmed"],
        )

    await append_attio_note(
        record_id,
        f"Inbound created draft event {event_id}. classification={decision['classification']} "
        f"speaker_confirmed={decision['speaker_confirmed']} room_confirmed={decision['room_confirmed']}",
    )
    return log_and_return({
        "path": "net_new", "record_id": record_id, "event_id": event_id, "event_created": True,
        "classification": decision["classification"], "reasoning": decision["reasoning"],
    })
