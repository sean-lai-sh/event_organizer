from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any

from .contracts import (
    ApprovalRecord,
    ArtifactRecord,
    ContextLinkRecord,
    MessageRecord,
    RunRecord,
    StreamEvent,
    ThreadRecord,
    ThreadStateResponse,
)
from .policy import ToolAction


class InMemoryRuntimeStore:
    """In-memory runtime state store for local execution and tests."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self.threads: dict[str, ThreadRecord] = {}
        self.runs: dict[str, RunRecord] = {}
        self.messages: dict[str, MessageRecord] = {}
        self.artifacts: dict[str, ArtifactRecord] = {}
        self.approvals: dict[str, ApprovalRecord] = {}
        self.context_links: dict[str, ContextLinkRecord] = {}

        self._thread_sequences: dict[str, int] = defaultdict(int)
        self._run_event_sequences: dict[str, int] = defaultdict(int)
        self._run_events: dict[str, list[StreamEvent]] = defaultdict(list)
        self._pending_actions: dict[str, ToolAction] = {}

    async def upsert_thread(self, record: ThreadRecord) -> None:
        async with self._lock:
            self.threads[record.external_id] = record

    async def get_thread(self, thread_id: str) -> ThreadRecord | None:
        return self.threads.get(thread_id)

    async def upsert_run(self, record: RunRecord) -> None:
        async with self._lock:
            self.runs[record.external_id] = record

    async def get_run(self, run_id: str) -> RunRecord | None:
        return self.runs.get(run_id)

    async def append_message(self, record: MessageRecord) -> None:
        async with self._lock:
            self.messages[record.external_id] = record
            current = self._thread_sequences[record.thread_external_id]
            self._thread_sequences[record.thread_external_id] = max(current, record.sequence_number)

    async def upsert_artifact(self, record: ArtifactRecord) -> None:
        async with self._lock:
            self.artifacts[record.external_id] = record

    async def upsert_approval(self, record: ApprovalRecord) -> None:
        async with self._lock:
            self.approvals[record.external_id] = record

    async def get_approval(self, approval_id: str) -> ApprovalRecord | None:
        return self.approvals.get(approval_id)

    async def put_context_link(self, link: ContextLinkRecord) -> None:
        async with self._lock:
            self.context_links[link.link_key] = link

    async def set_pending_action(self, run_id: str, action: ToolAction) -> None:
        async with self._lock:
            self._pending_actions[run_id] = action

    async def pop_pending_action(self, run_id: str) -> ToolAction | None:
        async with self._lock:
            return self._pending_actions.pop(run_id, None)

    async def next_sequence(self, thread_id: str) -> int:
        async with self._lock:
            self._thread_sequences[thread_id] += 1
            return self._thread_sequences[thread_id]

    async def append_stream_event(
        self,
        *,
        run_id: str,
        event: str,
        created_at: int,
        data: dict[str, Any] | None = None,
    ) -> StreamEvent:
        async with self._lock:
            self._run_event_sequences[run_id] += 1
            record = StreamEvent(
                run_id=run_id,
                sequence=self._run_event_sequences[run_id],
                event=event,
                created_at=created_at,
                data=data or {},
            )
            self._run_events[run_id].append(record)
            return record

    async def list_stream_events(self, run_id: str, *, after_sequence: int = 0) -> list[StreamEvent]:
        events = self._run_events.get(run_id, [])
        return [event for event in events if event.sequence > after_sequence]

    async def list_thread_state(self, thread_id: str) -> ThreadStateResponse | None:
        thread = self.threads.get(thread_id)
        if not thread:
            return None

        runs = [row for row in self.runs.values() if row.thread_external_id == thread_id]
        messages = [row for row in self.messages.values() if row.thread_external_id == thread_id]
        artifacts = [row for row in self.artifacts.values() if row.thread_external_id == thread_id]
        approvals = [row for row in self.approvals.values() if row.thread_external_id == thread_id]
        context_links = [row for row in self.context_links.values() if row.link_key.startswith(f"{thread_id}:")]

        runs.sort(key=lambda row: row.updated_at, reverse=True)
        messages.sort(key=lambda row: row.sequence_number)
        artifacts.sort(key=lambda row: row.sort_order)
        approvals.sort(key=lambda row: row.requested_at, reverse=True)
        context_links.sort(key=lambda row: row.created_at)

        return ThreadStateResponse(
            thread=thread,
            runs=runs,
            messages=messages,
            artifacts=artifacts,
            approvals=approvals,
            context_links=context_links,
        )
