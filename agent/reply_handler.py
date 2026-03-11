"""
Phase 4: Reply Handler — process inbound emails via AgentMail webhook.

MVP scope:
- Centralized inbox
- Known thread path: track inbound workflow state + event milestones
- Net-new path: always upsert Attio contact; only create draft event on clear event signal
"""
from __future__ import annotations

import json
import re
from email.utils import parseaddr
from typing import Any

import modal

from .tools import (
    ConvexClient,
    append_attio_note,
    get_agentmail_client,
    llm_call,
    upsert_inbound_contact,
)

app = modal.App("event-outreach-replies")

image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "httpx>=0.27", "anthropic>=0.40", "agentmail", "python-dotenv", "pydantic>=2.0",
)

KNOWN_THREAD_SYSTEM_PROMPT = """\
You are classifying an inbound reply in an event outreach thread.

Return valid JSON with:
- classification: one of ACCEPTED, DECLINED, QUESTION, NEEDS_HUMAN
- reasoning: short string
- speaker_confirmed: boolean
- room_confirmed: boolean

Rules:
- speaker_confirmed=true only when the message clearly confirms speaker participation.
- room_confirmed=true only when the message clearly confirms venue/logistics/room.
- If uncertain, return false for booleans.
"""

NET_NEW_SYSTEM_PROMPT = """\
You are triaging a net-new inbound email for a student club.

Return valid JSON with:
- classification: one of ACCEPTED, DECLINED, QUESTION, NEEDS_HUMAN
- reasoning: short string
- event_signal: boolean (is there a real event opportunity/request?)
- timing_signal: boolean (mentions timing/tentative date/time/confirmed schedule intent)
- speaker_confirmed: boolean
- room_confirmed: boolean
- event_extract: object with optional fields:
  - title
  - date (YYYY-MM-DD if explicit, else null)
  - time
  - location
  - description

Only set event_signal=true if the email indicates an event-related conversation.
Only set timing_signal=true if timing/scheduling intent is present.
"""

ACCEPT_PHRASES = (
    "sounds great",
    "count me in",
    "i can attend",
    "i can make it",
    "happy to join",
    "would love to speak",
    "confirmed",
    "works for me",
)
DECLINE_PHRASES = (
    "can't make it",
    "cannot make it",
    "won't be able",
    "not available",
    "have to decline",
    "decline",
    "pass this time",
)
QUESTION_PHRASES = (
    "can you share",
    "could you share",
    "what time",
    "where is",
    "more details",
    "who is",
    "how long",
)
SPEAKER_PHRASES = ("speak", "speaker", "panel", "presentation", "talk")
ROOM_PHRASES = ("room", "venue", "space", "location", "host", "logistics")
EVENT_SIGNAL_PHRASES = ("event", "workshop", "panel", "talk", "speaker", "session")
TIMING_SIGNAL_PHRASES = (
    "tentative",
    "confirmed",
    "next week",
    "next month",
    "tomorrow",
    "date",
    "time",
    "schedule",
)

DATE_RE = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")
TIME_RE = re.compile(r"\b\d{1,2}(:\d{2})?\s?(am|pm)\b", re.IGNORECASE)


def _normalize_email(value: str) -> str:
    return value.strip().lower()


def _extract_first_email(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        _, email = parseaddr(value)
        return _normalize_email(email) if email else None
    if isinstance(value, dict):
        for key in ("email", "email_address", "address", "from"):
            if isinstance(value.get(key), str):
                return _extract_first_email(value.get(key))
    if isinstance(value, list):
        for item in value:
            email = _extract_first_email(item)
            if email:
                return email
    return None


def _extract_email_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        chunks = [c.strip() for c in value.split(",") if c.strip()]
        emails = [_extract_first_email(c) for c in chunks]
        return [e for e in emails if e]
    if isinstance(value, dict):
        single = _extract_first_email(value)
        return [single] if single else []
    if isinstance(value, list):
        out: list[str] = []
        for item in value:
            out.extend(_extract_email_list(item))
        return list(dict.fromkeys(out))
    return []


def _clean_json(raw: str) -> dict:
    cleaned = (raw or "").strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0]
    return json.loads(cleaned)


def _has_any(text: str, phrases: tuple[str, ...]) -> bool:
    return any(p in text for p in phrases)


def _rule_classify(body: str) -> dict | None:
    text = (body or "").lower()
    if not text.strip():
        return None

    is_decline = _has_any(text, DECLINE_PHRASES)
    is_accept = _has_any(text, ACCEPT_PHRASES) and not is_decline
    is_question = "?" in text or _has_any(text, QUESTION_PHRASES)

    if is_accept:
        classification = "ACCEPTED"
    elif is_decline:
        classification = "DECLINED"
    elif is_question:
        classification = "QUESTION"
    else:
        return None

    speaker_confirmed = is_accept and _has_any(text, SPEAKER_PHRASES)
    room_confirmed = is_accept and _has_any(text, ROOM_PHRASES)
    event_signal = _has_any(text, EVENT_SIGNAL_PHRASES)
    timing_signal = bool(DATE_RE.search(text) or TIME_RE.search(text) or _has_any(text, TIMING_SIGNAL_PHRASES))

    return {
        "classification": classification,
        "reasoning": "rule-based classification",
        "speaker_confirmed": speaker_confirmed,
        "room_confirmed": room_confirmed,
        "event_signal": event_signal,
        "timing_signal": timing_signal,
        "event_extract": {},
    }


def _normalize_decision(raw: dict) -> dict:
    classification = str(raw.get("classification", "NEEDS_HUMAN")).upper()
    if classification not in {"ACCEPTED", "DECLINED", "QUESTION", "NEEDS_HUMAN"}:
        classification = "NEEDS_HUMAN"
    extract = raw.get("event_extract")
    if not isinstance(extract, dict):
        extract = {}
    return {
        "classification": classification,
        "reasoning": str(raw.get("reasoning", "")),
        "speaker_confirmed": bool(raw.get("speaker_confirmed", False)),
        "room_confirmed": bool(raw.get("room_confirmed", False)),
        "event_signal": bool(raw.get("event_signal", False)),
        "timing_signal": bool(raw.get("timing_signal", False)),
        "event_extract": extract,
    }


def _to_workflow_state(classification: str) -> tuple[str, str]:
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
    return val if DATE_RE.fullmatch(val) else None


def _event_payload(extract: dict, subject: str, created_by: str | None) -> dict:
    title = (extract.get("title") or subject or "Inbound Event Opportunity").strip()
    return {
        "title": title[:140],
        "description": (extract.get("description") or "Auto-created from inbound email").strip(),
        "event_date": _sanitize_event_date(extract.get("date")),
        "event_time": (extract.get("time") or None),
        "event_end_time": None,
        "location": (extract.get("location") or None),
        "event_type": None,
        "target_profile": None,
        "needs_outreach": False,
        "status": "draft",
        "created_by": created_by,
    }


async def _resolve_owner_emails(
    sb: ConvexClient,
    *,
    attio_record_id: str,
    event: dict | None,
    to_emails: list[str],
    cc_emails: list[str],
) -> list[str]:
    existing = await sb.resolve_assignees_by_record(attio_record_id)
    existing_emails = [
        _normalize_email(str(item.get("email")))
        for item in existing
        if item.get("email")
    ]
    if existing_emails:
        return list(dict.fromkeys(existing_emails))

    active = await sb.get_active_eboard_members()
    active_set = {
        _normalize_email(str(item.get("email")))
        for item in active
        if item.get("email")
    }
    candidates = set(_normalize_email(x) for x in (to_emails + cc_emails))
    matched = sorted(candidates & active_set)
    if matched:
        await sb.upsert_assignments_by_emails(attio_record_id, matched)
        return matched

    fallback = (event or {}).get("created_by")
    if isinstance(fallback, str) and fallback.strip():
        owner = _normalize_email(fallback)
        await sb.upsert_assignments_by_emails(attio_record_id, [owner])
        return [owner]
    return []


async def _classify_known_thread(
    *,
    sender_email: str,
    body: str,
    event: dict | None,
    thread_messages: list[dict],
) -> dict:
    rule = _rule_classify(body)
    if rule is not None:
        return _normalize_decision(rule)

    event_context = json.dumps(
        {
            "title": event.get("title") if event else "Unknown",
            "event_date": str(event.get("event_date", "")) if event else "",
            "location": event.get("location") if event else "",
            "description": event.get("description") if event else "",
        }
    )
    user_prompt = (
        f"## Event\n{event_context}\n\n"
        f"## Thread history\n{json.dumps(thread_messages, indent=2)}\n\n"
        f"## Latest reply\nFrom: {sender_email}\n{body}"
    )
    try:
        raw = await llm_call(KNOWN_THREAD_SYSTEM_PROMPT, user_prompt, max_tokens=512)
        parsed = _clean_json(raw)
        return _normalize_decision(parsed)
    except Exception:
        return _normalize_decision({"classification": "NEEDS_HUMAN", "reasoning": "LLM parse failure"})


async def _classify_net_new(
    *,
    sender_email: str,
    subject: str,
    body: str,
    to_emails: list[str],
    cc_emails: list[str],
) -> dict:
    rule = _rule_classify(body)
    base = _normalize_decision(rule or {})
    user_prompt = (
        f"## Message\n"
        f"From: {sender_email}\n"
        f"To: {to_emails}\n"
        f"Cc: {cc_emails}\n"
        f"Subject: {subject}\n\n"
        f"{body}"
    )
    try:
        raw = await llm_call(NET_NEW_SYSTEM_PROMPT, user_prompt, max_tokens=1024)
        parsed = _normalize_decision(_clean_json(raw))
    except Exception:
        parsed = _normalize_decision({})

    # Hybrid behavior: if rules produced a strong classification, keep it.
    if rule is not None:
        parsed["classification"] = base["classification"]
        parsed["reasoning"] = base["reasoning"]
        parsed["speaker_confirmed"] = bool(parsed["speaker_confirmed"] or base["speaker_confirmed"])
        parsed["room_confirmed"] = bool(parsed["room_confirmed"] or base["room_confirmed"])
        parsed["event_signal"] = bool(parsed["event_signal"] or base["event_signal"])
        parsed["timing_signal"] = bool(parsed["timing_signal"] or base["timing_signal"])

    return parsed


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("event-outreach-secrets")],
    timeout=90,
    allow_concurrent_inputs=10,
)
@modal.web_endpoint(method="POST")
async def handle_reply(payload: dict) -> dict:
    """AgentMail webhook endpoint for message.received events."""
    event_type = payload.get("event_type")
    if event_type != "message.received":
        return {"status": "ignored", "reason": f"Unhandled event type: {event_type}"}

    message = payload.get("message", {})
    thread_id = message.get("thread_id")
    message_id = message.get("message_id") or message.get("id")
    sender_raw = message.get("from_") or message.get("from")
    sender_email = _extract_first_email(sender_raw)
    sender_name, _ = parseaddr(sender_raw if isinstance(sender_raw, str) else "")
    subject = str(message.get("subject", "") or "")
    body = str(message.get("text", "") or "")
    to_emails = _extract_email_list(message.get("to"))
    cc_emails = _extract_email_list(message.get("cc"))

    if not sender_email:
        return {"status": "ignored", "reason": "No sender email"}

    if message_id:
        async with ConvexClient() as sb:
            is_duplicate = await sb.record_inbound_receipt(str(message_id), thread_id=thread_id)
        if is_duplicate:
            return {"status": "ignored", "reason": f"Duplicate message_id {message_id}"}

    async with ConvexClient() as sb:
        outreach = await sb.find_outreach_by_thread(thread_id) if thread_id else None

    # Known-thread workflow
    if outreach:
        event_id = outreach["event_id"]
        record_id = outreach["attio_record_id"]
        async with ConvexClient() as sb:
            event = await sb.get_event(event_id)

        agentmail = get_agentmail_client()
        try:
            thread = agentmail.threads.get(thread_id)
            thread_messages = [
                {"from": getattr(m, "from_", ""), "text": getattr(m, "text", "")}
                for m in getattr(thread, "messages", [])
            ]
        except Exception:
            thread_messages = []

        decision = await _classify_known_thread(
            sender_email=sender_email,
            body=body,
            event=event,
            thread_messages=thread_messages,
        )
        response, inbound_state = _to_workflow_state(decision["classification"])

        async with ConvexClient() as sb:
            await sb.apply_inbound_update(
                event_id,
                record_id,
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
            owner_emails = await _resolve_owner_emails(
                sb,
                attio_record_id=record_id,
                event=event,
                to_emails=to_emails,
                cc_emails=cc_emails,
            )

        await append_attio_note(
            record_id,
            (
                f"Inbound processed (known thread). classification={decision['classification']} "
                f"state={inbound_state} speaker_confirmed={decision['speaker_confirmed']} "
                f"room_confirmed={decision['room_confirmed']} owners={owner_emails}"
            ),
        )
        print(
            json.dumps(
                {
                    "path": "known_thread",
                    "thread_id": thread_id,
                    "event_id": event_id,
                    "record_id": record_id,
                    "classification": decision["classification"],
                    "inbound_state": inbound_state,
                }
            )
        )
        return {
            "status": "processed",
            "path": "known_thread",
            "event_id": event_id,
            "record_id": record_id,
            "classification": decision["classification"],
            "inbound_state": inbound_state,
            "reasoning": decision["reasoning"],
        }

    # Net-new fallback workflow: always upsert Attio contact.
    contact = await upsert_inbound_contact(sender_email, sender_name=sender_name)
    record_id = contact.get("id")
    decision = await _classify_net_new(
        sender_email=sender_email,
        subject=subject,
        body=body,
        to_emails=to_emails,
        cc_emails=cc_emails,
    )

    if not record_id:
        return {
            "status": "processed",
            "path": "net_new",
            "event_created": False,
            "classification": decision["classification"],
            "reasoning": decision["reasoning"],
        }

    # Only auto-create event when both signals are true.
    if not (decision["event_signal"] and decision["timing_signal"]):
        await append_attio_note(
            record_id,
            (
                "Inbound captured (net-new) without sufficient event signal for auto-create. "
                f"classification={decision['classification']} "
                f"event_signal={decision['event_signal']} timing_signal={decision['timing_signal']}"
            ),
        )
        print(
            json.dumps(
                {
                    "path": "net_new",
                    "record_id": record_id,
                    "event_created": False,
                    "event_signal": decision["event_signal"],
                    "timing_signal": decision["timing_signal"],
                }
            )
        )
        return {
            "status": "processed",
            "path": "net_new",
            "record_id": record_id,
            "event_created": False,
            "classification": decision["classification"],
            "reasoning": decision["reasoning"],
        }

    async with ConvexClient() as sb:
        owner_emails = await _resolve_owner_emails(
            sb,
            attio_record_id=record_id,
            event=None,
            to_emails=to_emails,
            cc_emails=cc_emails,
        )
        created_by = owner_emails[0] if owner_emails else None

        event_id = await sb.create_event(
            _event_payload(
                decision["event_extract"],
                subject=subject,
                created_by=created_by,
            )
        )
        await sb.upsert_outreach_link(event_id, record_id, thread_id=thread_id)
        response, inbound_state = _to_workflow_state(decision["classification"])
        await sb.apply_inbound_update(
            event_id,
            record_id,
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
        (
            f"Inbound created draft event {event_id}. classification={decision['classification']} "
            f"speaker_confirmed={decision['speaker_confirmed']} room_confirmed={decision['room_confirmed']}"
        ),
    )
    print(
        json.dumps(
            {
                "path": "net_new",
                "record_id": record_id,
                "event_id": event_id,
                "event_created": True,
                "classification": decision["classification"],
            }
        )
    )
    return {
        "status": "processed",
        "path": "net_new",
        "record_id": record_id,
        "event_id": event_id,
        "event_created": True,
        "classification": decision["classification"],
        "reasoning": decision["reasoning"],
    }
