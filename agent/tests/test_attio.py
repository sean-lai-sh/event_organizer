"""
Test: Attio client — upsert_inbound_contact, append_attio_note, idempotency.

Cleans up any Attio notes created during the test run.
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from helper.attio import AttioClient
from helper.tools import append_attio_note, upsert_inbound_contact

SEAN_EMAIL = "seanlai@nyu.edu"
SEAN_NAME = "Sean Lai"


@pytest.mark.asyncio
async def test_attio_contact_upsert_and_note() -> None:
    test_start = datetime.now(timezone.utc)
    record_id: str | None = None

    try:
        # 1. Upsert contact (find existing via email)
        contact = await upsert_inbound_contact(SEAN_EMAIL, sender_name=SEAN_NAME)
        record_id = contact["id"]
        assert record_id, "No record_id returned"

        # 2. Append note
        await append_attio_note(record_id, "Test note from test_attio.py — safe to delete.")

        # 3. Second upsert must return same record (idempotency)
        contact2 = await upsert_inbound_contact(SEAN_EMAIL, sender_name="Different Name")
        assert contact2["id"] == record_id, (
            f"Upsert not idempotent: got {contact2['id']} expected {record_id}"
        )

    finally:
        if record_id:
            async with AttioClient() as attio:
                notes = await attio.list_notes(record_id)
                for note in notes:
                    note_id = note.get("id", {}).get("note_id")
                    created_at_str = note.get("created_at")
                    if note_id and created_at_str:
                        note_dt = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
                        if note_dt >= test_start:
                            await attio.delete_note(note_id)
