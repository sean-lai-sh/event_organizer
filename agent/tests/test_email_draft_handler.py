"""Unit tests for the in-conversation email-draft handler.

Covers _draft_outreach_email in runtime/tool_executor.py:
- writes a draft via the run-context sync object
- returns a status the model can read without claiming the email was sent
- handles the "no run context" and "sync unavailable" edge cases gracefully
"""
from __future__ import annotations

import pytest

from runtime.contracts import EmailDraftRecord
from runtime.run_context import use_run_context
from runtime.tool_executor import _draft_outreach_email


class _FakeSync:
    """Minimal stand-in for ConvexAgentStateSync."""

    def __init__(self, *, persisted_id: str | None = "agent_email_drafts:1") -> None:
        self._persisted_id = persisted_id
        self.calls: list[EmailDraftRecord] = []

    async def upsert_email_draft(self, record: EmailDraftRecord) -> str | None:
        self.calls.append(record)
        return self._persisted_id


@pytest.mark.asyncio
async def test_draft_persists_and_returns_pending_review() -> None:
    sync = _FakeSync()
    with use_run_context(
        thread_external_id="thread_abc",
        run_external_id="run_xyz",
        sync=sync,
    ):
        result = await _draft_outreach_email(
            recipient_name="Jane Doe",
            recipient_email="jane@example.com",
            subject="Speaking at Fintech 2026",
            message_body="Hi Jane, …",
            signature="— Tech@NYU",
        )

    assert result["status"] == "draft_pending_user_review"
    assert isinstance(result["draft_id"], str)
    assert result["draft_id"].startswith("draft_")
    # Hard requirement: the model must not be told the email was sent.
    assert "sent" not in result["message"].lower() or "not" in result["message"].lower()

    assert len(sync.calls) == 1
    record = sync.calls[0]
    assert record.thread_external_id == "thread_abc"
    assert record.run_external_id == "run_xyz"
    assert record.to_email == "jane@example.com"
    assert record.subject == "Speaking at Fintech 2026"
    assert record.body == "Hi Jane, …"
    assert record.signature == "— Tech@NYU"
    assert record.external_id == result["draft_id"]


@pytest.mark.asyncio
async def test_draft_without_run_context_returns_not_persisted() -> None:
    # No `use_run_context(...)` wrapper: simulating the tool being called
    # outside the runtime loop.
    result = await _draft_outreach_email(
        recipient_name="Jane Doe",
        recipient_email="jane@example.com",
        subject="Hi",
        message_body="Body",
    )
    assert result["status"] == "draft_not_persisted"
    assert result["draft_id"] is None


@pytest.mark.asyncio
async def test_draft_falls_back_when_sync_returns_none() -> None:
    # Simulates Convex being disabled or the mutation returning None.
    sync = _FakeSync(persisted_id=None)
    with use_run_context(
        thread_external_id="thread_abc",
        run_external_id="run_xyz",
        sync=sync,
    ):
        result = await _draft_outreach_email(
            recipient_name="Jane",
            recipient_email="jane@example.com",
            subject="Hi",
            message_body="Body",
        )
    assert result["status"] == "draft_not_persisted"
    # The draft id is still surfaced so the model has something to reference,
    # but the message must explicitly tell the model the user did not see it.
    assert result["draft_id"] is not None
    assert "retry" in result["message"].lower()


@pytest.mark.asyncio
async def test_draft_optional_sender_fields_are_none_when_blank() -> None:
    sync = _FakeSync()
    with use_run_context(
        thread_external_id="thread_abc",
        run_external_id="run_xyz",
        sync=sync,
    ):
        await _draft_outreach_email(
            recipient_name="Jane",
            recipient_email="jane@example.com",
            subject="Hi",
            message_body="Body",
        )
    record = sync.calls[0]
    assert record.from_name is None
    assert record.from_email is None
    assert record.signature is None


def test_send_outreach_email_handler_is_the_draft_function() -> None:
    # Sanity: the runtime tool registry binds the model-facing tool name
    # to the draft-only handler, never to the AgentMail-sending function.
    from runtime.tool_executor import TOOL_HANDLERS

    assert TOOL_HANDLERS["send_outreach_email"] is _draft_outreach_email
