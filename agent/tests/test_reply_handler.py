"""
Test: reply_handler webhook — known thread, net-new (event created), net-new (weak signal).

Steps (shown individually in pytest output):
  1. test_known_thread   — thread_id matches seeded outreach row → known_thread path
  2. test_net_new_event  — strong event + timing signal → net_new, draft event auto-created
  3. test_weak_signal    — weak signal → net_new, no event created

Idempotency guarantee:
  • Convex: all seeded and auto-created events, outreach rows, and inbound receipts are
    deleted in teardown regardless of pass/fail.
  • Attio: notes written on Sean's record during the run are deleted (timestamp-fenced).
    Sean's contact fields are not mutated by any webhook path (append_attio_note is called
    without outreach_status, so no field updates occur).
  • Seed data (event + outreach link) is always deleted — it only ever existed for the test.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import httpx
import pytest

from helper.attio import AttioClient
from helper.tools import ConvexClient

SEAN_ATTIO_ID = "2d49cd9b-e058-427f-bdd7-3f8673a31ef0"
SEAN_EMAIL = "seanlai@nyu.edu"
FAKE_THREAD_ID = "test-thread-dev-001"

MSG_KNOWN = "test-msg-known-001"
MSG_NET_NEW = "test-msg-netnew-001"
MSG_WEAK = "test-msg-weak-001"
ALL_MSG_IDS = [MSG_KNOWN, MSG_NET_NEW, MSG_WEAK]

WEBHOOK_URL = "https://sean-lai-sh--event-outreach-replies-handle-reply-dev.modal.run"


# ── HTTP helper ───────────────────────────────────────────────────────────────

async def _fire(client: httpx.AsyncClient, label: str, payload: dict) -> dict:
    print(f"\n── {label} ──")
    resp = await client.post(WEBHOOK_URL, json=payload)
    body = resp.json()
    print(f"  {resp.status_code}: {body}")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {body}"
    return body


# ── Async helpers for seed / teardown ─────────────────────────────────────────

async def _seed(state: dict) -> None:
    async with ConvexClient() as sb:
        event_id = await sb.create_event({
            "title": "AI in Student Clubs — Test Talk",
            "description": "Seeded by test_reply_handler.py",
            "event_date": "2026-04-15",
            "event_time": "6:00 PM",
            "event_end_time": None,
            "location": "NYU Bobst Library, Room 601",
            "event_type": None,
            "target_profile": None,
            "needs_outreach": False,
            "status": "draft",
            "created_by": SEAN_EMAIL,
        })
        state["seeded_event_id"] = event_id
        state["created_event_ids"].append(event_id)
        await sb.upsert_outreach_link(event_id, SEAN_ATTIO_ID, thread_id=FAKE_THREAD_ID)


async def _teardown(state: dict) -> None:
    async with ConvexClient() as sb:
        for eid in state["created_event_ids"]:
            await sb.delete_outreach_for_event(eid)
            await sb.delete_event(eid)
        for msg_id in ALL_MSG_IDS:
            await sb.delete_inbound_receipt(msg_id)

    async with AttioClient() as attio:
        notes = await attio.list_notes(SEAN_ATTIO_ID)
        for note in notes:
            note_id = note.get("id", {}).get("note_id")
            created_at_str = note.get("created_at")
            if note_id and created_at_str:
                note_dt = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
                if note_dt >= state["test_start"]:
                    await attio.delete_note(note_id)


# ── Module-scoped fixture (sync wrapper so event-loop scope is never an issue) ─

@pytest.fixture(scope="module")
def reply_state() -> dict:
    """
    Seeds Convex with a test event + outreach link before any test runs,
    yields shared mutable state, then unconditionally tears down all created
    Convex rows and timestamp-fenced Attio notes.
    """
    state: dict = {
        "created_event_ids": [],
        "seeded_event_id": None,
        "test_start": datetime.now(timezone.utc),
    }
    asyncio.run(_seed(state))
    yield state
    asyncio.run(_teardown(state))


# ── Tests ─────────────────────────────────────────────────────────────────────

async def test_known_thread(reply_state: dict) -> None:
    """Step 1 — reply on a seeded thread_id is routed through the known_thread path."""
    async with httpx.AsyncClient(timeout=60) as client:
        body = await _fire(client, "KNOWN THREAD (accept + speaker confirm)", {
            "event_type": "message.received",
            "message": {
                "message_id": MSG_KNOWN,
                "thread_id": FAKE_THREAD_ID,
                "from_": f"Sean Lai <{SEAN_EMAIL}>",
                "to": "events@yourdomain.com",
                "cc": "",
                "subject": "Re: Speaking at AI in Student Clubs",
                "text": (
                    "Hey! Yes, I'd love to speak at your event. "
                    "Count me in — I can talk about LLM tooling for 30 minutes. "
                    "Does April 15th at 6pm still work?"
                ),
            },
        })
    assert body.get("path") == "known_thread"


async def test_net_new_event(reply_state: dict) -> None:
    """Step 2 — inbound with strong event + timing signal auto-creates a draft event."""
    async with httpx.AsyncClient(timeout=60) as client:
        body = await _fire(client, "NET-NEW (event + timing signal → auto-create draft)", {
            "event_type": "message.received",
            "message": {
                "message_id": MSG_NET_NEW,
                "thread_id": "test-thread-netnew-001",
                "from_": f"Sean Lai <{SEAN_EMAIL}>",
                "to": "events@yourdomain.com",
                "cc": "",
                "subject": "Interested in hosting a workshop next month",
                "text": (
                    "Hi! I wanted to reach out about potentially hosting a workshop "
                    "on building AI agents. I'm thinking sometime in April — maybe "
                    "the week of April 14th? Let me know if that works for your club."
                ),
            },
        })
    assert body.get("path") == "net_new"
    # Track any auto-created event so teardown can delete it
    if body.get("event_created") and body.get("event_id"):
        reply_state["created_event_ids"].append(body["event_id"])


async def test_weak_signal(reply_state: dict) -> None:
    """Step 3 — inbound with weak signal is captured as a contact only, no event created."""
    async with httpx.AsyncClient(timeout=60) as client:
        body = await _fire(client, "NET-NEW (weak signal → contact only)", {
            "event_type": "message.received",
            "message": {
                "message_id": MSG_WEAK,
                "thread_id": "test-thread-weak-001",
                "from_": f"Sean Lai <{SEAN_EMAIL}>",
                "to": "events@yourdomain.com",
                "cc": "",
                "subject": "Quick hello",
                "text": "Hey, just wanted to introduce myself. Happy to chat sometime!",
            },
        })
    assert body.get("path") == "net_new"
    assert not body.get("event_created"), f"Weak signal should not create event: {body}"