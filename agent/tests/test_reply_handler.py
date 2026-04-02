from __future__ import annotations

import pytest

import reply_handler

RAW_HANDLE_REPLY = reply_handler.handle_reply.get_raw_f()

KNOWN_EMAIL_THREAD_ID = "email-thread-known-001"
WEAK_EMAIL_THREAD_ID = "email-thread-weak-001"


class StubConvexClient:
    def __init__(
        self,
        *,
        outreach_by_email_thread_id: dict[str, dict],
        receipt_state: dict | None = None,
    ) -> None:
        self._outreach_by_email_thread_id = outreach_by_email_thread_id
        self._receipt_state = receipt_state or {
            "should_process": True,
            "is_duplicate": False,
            "in_progress": False,
        }

    async def __aenter__(self) -> "StubConvexClient":
        return self

    async def __aexit__(self, *_args) -> None:
        return None

    async def begin_inbound_receipt(self, message_id: str, thread_id: str | None = None) -> dict:
        _ = (message_id, thread_id)
        return self._receipt_state

    async def find_outreach_by_thread(self, thread_id: str) -> dict | None:
        return self._outreach_by_email_thread_id.get(thread_id)

    async def complete_inbound_receipt(self, message_id: str, thread_id: str | None = None) -> bool:
        _ = (message_id, thread_id)
        return False

    async def release_inbound_receipt(self, message_id: str) -> None:
        _ = message_id


def _payload(
    *,
    message_id: str,
    email_thread_id: str,
    subject: str,
    text: str,
) -> dict:
    return {
        "event_type": "message.received",
        "message": {
            "message_id": message_id,
            "thread_id": email_thread_id,
            "from_": "Sean Lai <seanlai@nyu.edu>",
            "to": "events@yourdomain.com",
            "cc": "",
            "subject": subject,
            "text": text,
        },
    }


@pytest.mark.asyncio
async def test_known_email_thread_routes_to_known_thread(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        reply_handler,
        "ConvexClient",
        lambda: StubConvexClient(
            outreach_by_email_thread_id={
                KNOWN_EMAIL_THREAD_ID: {"event_id": "event-1", "attio_record_id": "person-1"}
            }
        ),
    )

    async def fake_known_thread(**kwargs):
        assert kwargs["thread_id"] == KNOWN_EMAIL_THREAD_ID
        assert kwargs["sender_email"] == "seanlai@nyu.edu"
        return {"status": "processed", "path": "known_thread"}

    monkeypatch.setattr(reply_handler, "handle_known_thread", fake_known_thread)

    body = await RAW_HANDLE_REPLY(
        _payload(
            message_id="msg-known-001",
            email_thread_id=KNOWN_EMAIL_THREAD_ID,
            subject="Re: Speaking at AI in Student Clubs",
            text="Yes, I would love to speak.",
        )
    )

    assert body["path"] == "known_thread"


@pytest.mark.asyncio
async def test_net_new_event_routes_to_net_new(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        reply_handler,
        "ConvexClient",
        lambda: StubConvexClient(outreach_by_email_thread_id={}),
    )

    async def fake_net_new(**kwargs):
        assert kwargs["thread_id"] == "email-thread-netnew-001"
        assert kwargs["sender_email"] == "seanlai@nyu.edu"
        return {
            "status": "processed",
            "path": "net_new",
            "event_created": True,
            "event_id": "event-net-new-1",
            "strong_signal": True,
        }

    monkeypatch.setattr(reply_handler, "handle_net_new", fake_net_new)

    body = await RAW_HANDLE_REPLY(
        _payload(
            message_id="msg-netnew-001",
            email_thread_id="email-thread-netnew-001",
            subject="Interested in hosting a workshop next month",
            text="I want to host a workshop in April.",
        )
    )

    assert body["path"] == "net_new"
    assert body["event_created"] is True
    assert body["strong_signal"] is True


@pytest.mark.asyncio
async def test_weak_signal_routes_to_net_new_tracking_event(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        reply_handler,
        "ConvexClient",
        lambda: StubConvexClient(outreach_by_email_thread_id={}),
    )

    async def fake_net_new(**kwargs):
        assert kwargs["thread_id"] == WEAK_EMAIL_THREAD_ID
        return {
            "status": "processed",
            "path": "net_new",
            "event_created": True,
            "event_id": "event-weak-1",
            "strong_signal": False,
        }

    monkeypatch.setattr(reply_handler, "handle_net_new", fake_net_new)

    body = await RAW_HANDLE_REPLY(
        _payload(
            message_id="msg-weak-001",
            email_thread_id=WEAK_EMAIL_THREAD_ID,
            subject="Quick hello",
            text="Happy to chat sometime.",
        )
    )

    assert body["path"] == "net_new"
    assert body["event_created"] is True
    assert body["event_id"] == "event-weak-1"
    assert body["strong_signal"] is False


@pytest.mark.asyncio
async def test_existing_email_thread_continuation_routes_to_known_thread(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        reply_handler,
        "ConvexClient",
        lambda: StubConvexClient(
            outreach_by_email_thread_id={
                WEAK_EMAIL_THREAD_ID: {"event_id": "event-weak-1", "attio_record_id": "person-1"}
            }
        ),
    )

    async def fake_known_thread(**kwargs):
        assert kwargs["thread_id"] == WEAK_EMAIL_THREAD_ID
        return {"status": "processed", "path": "known_thread"}

    monkeypatch.setattr(reply_handler, "handle_known_thread", fake_known_thread)

    body = await RAW_HANDLE_REPLY(
        _payload(
            message_id="msg-thread-follow-001",
            email_thread_id=WEAK_EMAIL_THREAD_ID,
            subject="Re: Quick hello",
            text="Actually I would love to do a talk in April.",
        )
    )

    assert body["path"] == "known_thread"
