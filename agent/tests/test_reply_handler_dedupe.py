from __future__ import annotations

import pytest

import reply_handler

RAW_HANDLE_REPLY = reply_handler.handle_reply.get_raw_f()


class StubConvexClient:
    def __init__(self, log: list[tuple], *, begin_result: dict, outreach: dict | None) -> None:
        self._log = log
        self._begin_result = begin_result
        self._outreach = outreach

    async def __aenter__(self) -> "StubConvexClient":
        return self

    async def __aexit__(self, *_args) -> None:
        return None

    async def begin_inbound_receipt(self, message_id: str, thread_id: str | None = None) -> dict:
        self._log.append(("begin", message_id, thread_id))
        return self._begin_result

    async def find_outreach_by_thread(self, thread_id: str) -> dict | None:
        self._log.append(("find_outreach", thread_id))
        return self._outreach

    async def complete_inbound_receipt(self, message_id: str, thread_id: str | None = None) -> bool:
        self._log.append(("complete", message_id, thread_id))
        return False

    async def release_inbound_receipt(self, message_id: str) -> None:
        self._log.append(("release", message_id))


def _payload(message_id: str = "msg-1", thread_id: str = "thread-1") -> dict:
    return {
        "event_type": "message.received",
        "message": {
            "message_id": message_id,
            "thread_id": thread_id,
            "from_": "Test User <test@example.com>",
            "to": "events@example.com",
            "cc": "",
            "subject": "Re: Test",
            "text": "I am interested.",
        },
    }


@pytest.mark.asyncio
async def test_handle_reply_commits_dedupe_after_success(monkeypatch: pytest.MonkeyPatch) -> None:
    log: list[tuple] = []

    monkeypatch.setattr(
        reply_handler,
        "ConvexClient",
        lambda: StubConvexClient(
            log,
            begin_result={"should_process": True, "is_duplicate": False, "in_progress": False},
            outreach={"event_id": "event-1", "attio_record_id": "person-1"},
        ),
    )

    async def fake_known_thread(**kwargs):
        log.append(("known_thread", kwargs["thread_id"]))
        return {"status": "processed", "path": "known_thread"}

    monkeypatch.setattr(reply_handler, "handle_known_thread", fake_known_thread)

    result = await RAW_HANDLE_REPLY(_payload())

    assert result["path"] == "known_thread"
    assert log == [
        ("begin", "msg-1", "thread-1"),
        ("find_outreach", "thread-1"),
        ("known_thread", "thread-1"),
        ("complete", "msg-1", "thread-1"),
    ]


@pytest.mark.asyncio
async def test_handle_reply_releases_claim_when_processing_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    log: list[tuple] = []

    monkeypatch.setattr(
        reply_handler,
        "ConvexClient",
        lambda: StubConvexClient(
            log,
            begin_result={"should_process": True, "is_duplicate": False, "in_progress": False},
            outreach={"event_id": "event-1", "attio_record_id": "person-1"},
        ),
    )

    async def fake_known_thread(**_kwargs):
        log.append(("known_thread", "raised"))
        raise RuntimeError("boom")

    monkeypatch.setattr(reply_handler, "handle_known_thread", fake_known_thread)

    with pytest.raises(RuntimeError, match="boom"):
        await RAW_HANDLE_REPLY(_payload())

    assert log == [
        ("begin", "msg-1", "thread-1"),
        ("find_outreach", "thread-1"),
        ("known_thread", "raised"),
        ("release", "msg-1"),
    ]
