from __future__ import annotations

import logging
import os

from helper.tools import ConvexClient
from runtime.contracts import (
    ApprovalRecord,
    ArtifactRecord,
    ContextLinkRecord,
    MessageRecord,
    RunRecord,
    ThreadRecord,
)

logger = logging.getLogger(__name__)


class ConvexAgentStateSync:
    """Best-effort Convex synchronization for normalized agent state."""

    def __init__(self) -> None:
        self._enabled = bool(os.environ.get("CONVEX_URL") and os.environ.get("CONVEX_DEPLOY_KEY"))
        self._thread_id_map: dict[str, str] = {}
        self._run_id_map: dict[str, str] = {}

    @property
    def enabled(self) -> bool:
        return self._enabled

    async def upsert_thread(self, record: ThreadRecord) -> str | None:
        if not self._enabled:
            return None

        args = {
            "external_id": record.external_id,
            "channel": record.channel.value,
            "status": record.status,
            "title": record.title,
            "summary": record.summary,
            "created_by_user_id": record.created_by_user_id,
            "last_message_at": record.last_message_at,
            "last_run_started_at": record.last_run_started_at,
            "archived_at": record.archived_at,
            "created_at": record.created_at,
            "updated_at": record.updated_at,
        }
        try:
            async with ConvexClient() as sb:
                convex_id = await sb.mutation("agentState:upsertThread", args)
            if isinstance(convex_id, str):
                self._thread_id_map[record.external_id] = convex_id
            return convex_id
        except Exception as exc:
            logger.warning("Convex thread sync failed: %s", exc)
            return None

    async def upsert_run(self, record: RunRecord) -> str | None:
        if not self._enabled:
            return None

        thread_convex_id = await self._ensure_thread_convex_id(record.thread_external_id)
        if not thread_convex_id:
            return None

        args = {
            "thread_id": thread_convex_id,
            "external_id": record.external_id,
            "status": record.status.value,
            "trigger_source": record.trigger_source,
            "mode": record.mode,
            "initiated_by_user_id": record.initiated_by_user_id,
            "model": record.model,
            "summary": record.summary,
            "error_message": record.error_message,
            "started_at": record.started_at,
            "completed_at": record.completed_at,
            "updated_at": record.updated_at,
            "latest_message_sequence": record.latest_message_sequence,
        }
        try:
            async with ConvexClient() as sb:
                convex_id = await sb.mutation("agentState:upsertRun", args)
            if isinstance(convex_id, str):
                self._run_id_map[record.external_id] = convex_id
            return convex_id
        except Exception as exc:
            logger.warning("Convex run sync failed: %s", exc)
            return None

    async def append_message(self, record: MessageRecord) -> str | None:
        if not self._enabled:
            return None

        thread_convex_id = await self._ensure_thread_convex_id(record.thread_external_id)
        run_convex_id = await self._ensure_run_convex_id(record.run_external_id) if record.run_external_id else None
        if not thread_convex_id:
            return None

        args = {
            "thread_id": thread_convex_id,
            "run_id": run_convex_id,
            "external_id": record.external_id,
            "role": record.role,
            "status": record.status,
            "sequence_number": record.sequence_number,
            "plain_text": record.plain_text,
            "content_blocks": [block.model_dump() for block in record.content_blocks],
            "created_at": record.created_at,
            "updated_at": record.updated_at,
        }
        try:
            async with ConvexClient() as sb:
                return await sb.mutation("agentState:appendMessage", args)
        except Exception as exc:
            logger.warning("Convex message sync failed: %s", exc)
            return None

    async def upsert_artifact(self, record: ArtifactRecord) -> str | None:
        if not self._enabled:
            return None

        thread_convex_id = await self._ensure_thread_convex_id(record.thread_external_id)
        run_convex_id = await self._ensure_run_convex_id(record.run_external_id) if record.run_external_id else None
        if not thread_convex_id:
            return None

        args = {
            "thread_id": thread_convex_id,
            "run_id": run_convex_id,
            "external_id": record.external_id,
            "kind": record.kind.value,
            "status": record.status,
            "sort_order": record.sort_order,
            "title": record.title,
            "summary": record.summary,
            "content_blocks": [block.model_dump() for block in record.content_blocks],
            "created_at": record.created_at,
            "updated_at": record.updated_at,
        }
        try:
            async with ConvexClient() as sb:
                return await sb.mutation("agentState:upsertArtifact", args)
        except Exception as exc:
            logger.warning("Convex artifact sync failed: %s", exc)
            return None

    async def upsert_approval(self, record: ApprovalRecord) -> str | None:
        if not self._enabled:
            return None

        thread_convex_id = await self._ensure_thread_convex_id(record.thread_external_id)
        run_convex_id = await self._ensure_run_convex_id(record.run_external_id)
        if not thread_convex_id or not run_convex_id:
            return None

        args = {
            "thread_id": thread_convex_id,
            "run_id": run_convex_id,
            "external_id": record.external_id,
            "status": record.status.value,
            "action_type": record.action_type,
            "title": record.title,
            "summary": record.summary,
            "risk_level": record.risk_level.value,
            "payload_json": record.payload_json,
            "requested_at": record.requested_at,
            "expires_at": record.expires_at,
            "resolved_at": record.resolved_at,
            "decision_note": record.decision_note,
            "decided_by_user_id": record.decided_by_user_id,
            "updated_at": record.updated_at,
        }
        try:
            async with ConvexClient() as sb:
                return await sb.mutation("agentState:upsertApproval", args)
        except Exception as exc:
            logger.warning("Convex approval sync failed: %s", exc)
            return None

    async def resolve_approval(self, record: ApprovalRecord) -> str | None:
        if not self._enabled:
            return None

        args = {
            "external_id": record.external_id,
            "status": record.status.value,
            "decision_note": record.decision_note,
            "decided_by_user_id": record.decided_by_user_id,
            "resolved_at": record.resolved_at,
            "updated_at": record.updated_at,
        }
        try:
            async with ConvexClient() as sb:
                return await sb.mutation("agentState:resolveApproval", args)
        except Exception as exc:
            logger.warning("Convex approval resolve sync failed: %s", exc)
            return None

    async def upsert_context_link(self, thread_external_id: str, record: ContextLinkRecord, run_external_id: str | None = None) -> str | None:
        if not self._enabled:
            return None

        thread_convex_id = await self._ensure_thread_convex_id(thread_external_id)
        run_convex_id = await self._ensure_run_convex_id(run_external_id) if run_external_id else None
        if not thread_convex_id:
            return None

        args = {
            "thread_id": thread_convex_id,
            "run_id": run_convex_id,
            "link_key": record.link_key,
            "relation": record.relation,
            "entity_type": record.entity_type,
            "entity_id": record.entity_id,
            "label": record.label,
            "url": record.url,
            "metadata_json": record.metadata_json,
            "created_at": record.created_at,
            "updated_at": record.updated_at,
        }
        try:
            async with ConvexClient() as sb:
                return await sb.mutation("agentState:upsertContextLink", args)
        except Exception as exc:
            logger.warning("Convex context-link sync failed: %s", exc)
            return None

    async def fetch_thread_state(self, external_thread_id: str) -> dict | None:
        if not self._enabled:
            return None
        try:
            async with ConvexClient() as sb:
                return await sb.query("agentState:getThreadState", {"external_id": external_thread_id})
        except Exception as exc:
            logger.warning("Convex thread fetch failed: %s", exc)
            return None

    async def _ensure_thread_convex_id(self, external_thread_id: str) -> str | None:
        cached = self._thread_id_map.get(external_thread_id)
        if cached:
            return cached

        state = await self.fetch_thread_state(external_thread_id)
        thread = (state or {}).get("thread") if isinstance(state, dict) else None
        if isinstance(thread, dict):
            thread_id = thread.get("_id")
            if isinstance(thread_id, str):
                self._thread_id_map[external_thread_id] = thread_id
                return thread_id
        return None

    async def _ensure_run_convex_id(self, external_run_id: str | None) -> str | None:
        if not external_run_id:
            return None
        cached = self._run_id_map.get(external_run_id)
        if cached:
            return cached

        try:
            async with ConvexClient() as sb:
                state = await sb.query("agentState:getRunState", {"external_id": external_run_id})
        except Exception as exc:
            logger.warning("Convex run fetch failed: %s", exc)
            return None

        run = (state or {}).get("run") if isinstance(state, dict) else None
        if isinstance(run, dict):
            run_id = run.get("_id")
            if isinstance(run_id, str):
                self._run_id_map[external_run_id] = run_id
                return run_id
        return None
