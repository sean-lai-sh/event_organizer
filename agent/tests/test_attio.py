"""
Test: Attio client — upsert_inbound_contact, append_attio_note, idempotency.

Steps (shown individually in pytest output):
  1. test_upsert_contact  — find Sean's existing record by email (no creation)
  2. test_append_note     — write a note on the contact
  3. test_idempotency     — second upsert with a different name must return the same record

Idempotency guarantee:
  Sean's contact record is pre-existing in Attio — no record is created or deleted.
  The only side effect is the note from step 2, which is removed in teardown
  (timestamp-fenced: only notes created after test_start are deleted).
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import pytest

from helper.attio import AttioClient
from helper.tools import append_attio_note, upsert_inbound_contact

SEAN_EMAIL = "seanlai@nyu.edu"
SEAN_NAME = "Sean Lai"


# ── Async helpers for setup / teardown ────────────────────────────────────────

async def _delete_test_notes(record_id: str, test_start: datetime) -> None:
    async with AttioClient() as attio:
        notes = await attio.list_notes(record_id)
        for note in notes:
            note_id = note.get("id", {}).get("note_id")
            created_at_str = note.get("created_at")
            if note_id and created_at_str:
                note_dt = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
                if note_dt >= test_start:
                    await attio.delete_note(note_id)


# ── Module-scoped fixture (sync wrapper so event-loop scope is never an issue) ─

@pytest.fixture(scope="module")
def attio_state() -> dict:
    """
    Shared state dict for the module. Teardown deletes any Attio notes
    written during the run — Sean's record itself is untouched.
    """
    state: dict = {"record_id": None, "test_start": datetime.now(timezone.utc)}
    yield state
    if state["record_id"]:
        asyncio.run(_delete_test_notes(state["record_id"], state["test_start"]))


# ── Tests ─────────────────────────────────────────────────────────────────────

async def test_upsert_contact(attio_state: dict) -> None:
    """Step 1 — resolve Sean's existing Attio contact via email lookup."""
    contact = await upsert_inbound_contact(SEAN_EMAIL, sender_name=SEAN_NAME)
    attio_state["record_id"] = contact["id"]
    assert attio_state["record_id"], "No record_id returned from upsert"


async def test_append_note(attio_state: dict) -> None:
    """Step 2 — append a note to Sean's contact (cleaned up in teardown)."""
    if not attio_state["record_id"]:
        pytest.skip("record_id not set — test_upsert_contact must pass first")
    await append_attio_note(
        attio_state["record_id"],
        "Test note from test_attio.py — safe to delete.",
    )


async def test_idempotency(attio_state: dict) -> None:
    """Step 3 — second upsert with a different name must return the same record_id."""
    if not attio_state["record_id"]:
        pytest.skip("record_id not set — test_upsert_contact must pass first")
    contact2 = await upsert_inbound_contact(SEAN_EMAIL, sender_name="Different Name")
    assert contact2["id"] == attio_state["record_id"], (
        f"Upsert not idempotent: got {contact2['id']}, expected {attio_state['record_id']}"
    )