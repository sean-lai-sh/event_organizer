from __future__ import annotations

import json
from time import time
from uuid import uuid4

from fastapi import HTTPException

from .anthropic_adapter import AnthropicRuntimeAdapter, DEFAULT_SYSTEM_PROMPT
from .contracts import (
    ApprovalDecisionRequest,
    ApprovalDecisionResponse,
    ApprovalRecord,
    ApprovalStatus,
    ArtifactRecord,
    ContextLinkRecord,
    MessageRecord,
    RunCreateRequest,
    RunRecord,
    RunStatus,
    RunWithEventsResponse,
    ThreadCreateRequest,
    ThreadRecord,
    ThreadStateResponse,
    TraceStepKind,
    TraceStepRecord,
)
from .convex_sync import ConvexAgentStateSync
from .normalize import (
    extract_action_items,
    make_checklist_artifact,
    make_report_artifact,
    make_trace_step,
    summarize_text_for_run,
    summarize_text_for_thread,
    text_block,
)
from .policy import ApprovalPolicy, ToolAction, infer_tool_action_from_text
from .store import InMemoryRuntimeStore
from .tool_expectations import (
    RequestToolExpectation,
    attempted_relevant_tools,
    infer_request_tool_expectation,
    looks_like_fake_limitation,
)
from .tool_executor import execute_tool_call


def _now_ms() -> int:
    return int(time() * 1000)


def _make_approval_title(action: ToolAction) -> str:
    tool_input = action.payload.get("tool_input", {})
    if action.name == "create_event":
        name = tool_input.get("title", "untitled event")
        date = tool_input.get("event_date", "")
        return f"Create event: {name}" + (f" on {date}" if date else "")
    if action.name == "update_event_safe":
        return "Update event details"
    if action.name == "create_contact":
        first = tool_input.get("firstname", "")
        last = tool_input.get("lastname", "")
        full = f"{first} {last}".strip()
        return f"Create contact: {full}" if full else "Create contact"
    if action.name == "update_contact":
        return "Update contact"
    return f"Approval required: {action.name}"


class AgentRuntimeService:
    """Modal-side orchestration service for threads, runs, approvals, and sync."""

    def __init__(
        self,
        *,
        store: InMemoryRuntimeStore | None = None,
        adapter: AnthropicRuntimeAdapter | None = None,
        policy: ApprovalPolicy | None = None,
        convex_sync: ConvexAgentStateSync | None = None,
    ) -> None:
        self._store = store or InMemoryRuntimeStore()
        self._adapter = adapter or AnthropicRuntimeAdapter()
        self._policy = policy or ApprovalPolicy()
        self._sync = convex_sync or ConvexAgentStateSync()

    async def create_thread(self, request: ThreadCreateRequest) -> ThreadRecord:
        created_at = _now_ms()
        thread_id = request.external_id or f"thread_{uuid4().hex}"

        existing = await self._store.get_thread(thread_id)
        if existing:
            return existing

        thread = ThreadRecord(
            external_id=thread_id,
            channel=request.channel,
            status="active",
            title=request.title,
            summary=None,
            created_by_user_id=request.created_by_user_id,
            created_at=created_at,
            updated_at=created_at,
        )
        await self._store.upsert_thread(thread)
        await self._sync.upsert_thread(thread)

        if request.context_links:
            for link in request.context_links:
                link_now = _now_ms()
                stored_link = ContextLinkRecord(
                    link_key=f"{thread.external_id}:{link.entity_type}:{link.entity_id}",
                    relation=link.relation,
                    entity_type=link.entity_type,
                    entity_id=link.entity_id,
                    label=link.label,
                    url=link.url,
                    metadata_json=link.metadata_json,
                    created_at=link_now,
                    updated_at=link_now,
                )
                await self._store.put_context_link(stored_link)
                await self._sync.upsert_context_link(thread.external_id, stored_link)

        return thread

    async def list_threads(self, *, limit: int = 50) -> list[ThreadRecord]:
        remote_threads = await self._sync.fetch_threads(limit=limit)
        if remote_threads is not None:
            threads = [
                self._hydrate_thread_record(item)
                for item in remote_threads
                if isinstance(item, dict)
            ]
            for thread in threads:
                await self._store.upsert_thread(thread)
            return threads

        return await self._store.list_threads(limit=limit)

    async def get_thread_state(self, thread_id: str) -> ThreadStateResponse:
        local = await self._store.list_thread_state(thread_id)
        if local:
            return local

        state = await self._sync.fetch_thread_state(thread_id)
        if not state:
            raise HTTPException(status_code=404, detail=f"Thread not found: {thread_id}")

        hydrated = self._hydrate_thread_state(state)
        await self._store.upsert_thread(hydrated.thread)
        for run in hydrated.runs:
            await self._store.upsert_run(run)
        for message in hydrated.messages:
            await self._store.append_message(message)
        for artifact in hydrated.artifacts:
            await self._store.upsert_artifact(artifact)
        for approval in hydrated.approvals:
            await self._store.upsert_approval(approval)
        for link in hydrated.context_links:
            await self._store.put_context_link(link)
        for trace in hydrated.traces:
            await self._store.append_trace(trace)

        return hydrated

    async def start_run(self, request: RunCreateRequest) -> RunWithEventsResponse:
        thread = await self._store.get_thread(request.thread_id)
        if not thread:
            await self.get_thread_state(request.thread_id)
            thread = await self._store.get_thread(request.thread_id)
        if not thread:
            raise HTTPException(status_code=404, detail=f"Thread not found: {request.thread_id}")

        now = _now_ms()
        run = RunRecord(
            external_id=f"run_{uuid4().hex}",
            thread_external_id=request.thread_id,
            status=RunStatus.RUNNING,
            trigger_source=request.trigger_source,
            mode=request.mode,
            initiated_by_user_id=request.initiated_by_user_id,
            model=self._adapter.model,
            started_at=now,
            updated_at=now,
        )
        await self._store.upsert_run(run)
        await self._sync.upsert_run(run)
        await self._store.append_stream_event(
            run_id=run.external_id,
            event="run.started",
            created_at=now,
            data={"status": run.status.value},
        )

        # Emit planning trace step
        await self._emit_trace(
            thread_id=request.thread_id,
            run_id=run.external_id,
            kind=TraceStepKind.PLANNING,
            summary="Analyzing request and planning execution strategy.",
        )

        await self._append_message(
            thread_id=request.thread_id,
            run_id=run.external_id,
            role="user",
            status="final",
            blocks=[text_block(request.input_text)],
        )

        await self._execute_run(run=run, user_input=request.input_text, max_tokens=request.max_tokens)
        resolved = await self._store.get_run(run.external_id)
        if not resolved:
            raise HTTPException(status_code=500, detail="Run state missing after execution")
        events = await self._store.list_stream_events(run.external_id)
        traces = await self._store.list_traces_for_run(run.external_id)
        return RunWithEventsResponse(run=resolved, events=events, traces=traces)

    async def submit_approval(self, approval_id: str, request: ApprovalDecisionRequest) -> ApprovalDecisionResponse:
        decision_status = ApprovalStatus(request.decision)

        approval = await self._store.get_approval(approval_id)
        if not approval:
            thread_id = await self._sync.fetch_approval_thread_id(approval_id)
            if thread_id:
                try:
                    await self.get_thread_state(thread_id)
                except HTTPException:
                    pass
                approval = await self._store.get_approval(approval_id)
        if not approval:
            raise HTTPException(status_code=404, detail=f"Approval not found: {approval_id}")

        if approval.status != ApprovalStatus.PENDING:
            run = await self._store.get_run(approval.run_external_id)
            if not run:
                raise HTTPException(status_code=500, detail="Run missing for resolved approval")
            return ApprovalDecisionResponse(approval=approval, run=run)

        now = _now_ms()
        approval = approval.model_copy(
            update={
                "status": decision_status,
                "decision_note": request.note,
                "decided_by_user_id": request.decided_by_user_id,
                "resolved_at": now,
                "updated_at": now,
            }
        )
        await self._store.upsert_approval(approval)
        await self._sync.resolve_approval(approval)
        await self._store.append_stream_event(
            run_id=approval.run_external_id,
            event="approval.resolved",
            created_at=now,
            data={"approval_id": approval.external_id, "decision": approval.status.value},
        )

        # Emit approval resolution trace
        await self._emit_trace(
            thread_id=approval.thread_external_id,
            run_id=approval.run_external_id,
            kind=TraceStepKind.APPROVAL_RESOLUTION,
            summary=f"Approval {approval.status.value}: {approval.title}",
            detail_json=json.dumps({"decision": approval.status.value, "note": request.note}),
        )

        run = await self._store.get_run(approval.run_external_id)
        if not run:
            raise HTTPException(status_code=500, detail="Run missing for approval")

        if approval.status == ApprovalStatus.REJECTED:
            run = run.model_copy(
                update={
                    "status": RunStatus.COMPLETED,
                    "completed_at": now,
                    "updated_at": now,
                    "summary": "Action rejected by user; run finalized.",
                }
            )
            await self._store.upsert_run(run)
            await self._sync.upsert_run(run)
            await self._append_message(
                thread_id=run.thread_external_id,
                run_id=run.external_id,
                role="assistant",
                status="final",
                blocks=[text_block("Action was rejected. No external changes were applied.")],
            )
            await self._store.append_stream_event(
                run_id=run.external_id,
                event="run.completed",
                created_at=now,
                data={"status": run.status.value},
            )
            await self._emit_trace(
                thread_id=run.thread_external_id,
                run_id=run.external_id,
                kind=TraceStepKind.RUN_COMPLETED,
                summary="Run completed: action was rejected by user.",
            )
            return ApprovalDecisionResponse(approval=approval, run=run)

        pending_action = await self._store.pop_pending_action(run.external_id)
        if not pending_action and approval.payload_json:
            try:
                pending_action = ToolAction.model_validate_json(approval.payload_json)
            except Exception:
                pending_action = None

        run = run.model_copy(update={"status": RunStatus.RUNNING, "updated_at": now})
        await self._store.upsert_run(run)
        await self._sync.upsert_run(run)
        await self._store.append_stream_event(
            run_id=run.external_id,
            event="run.resumed",
            created_at=now,
            data={"status": run.status.value},
        )

        action_label = pending_action.name if pending_action else "approved_action"
        tool_payload = pending_action.payload.get("tool_input") if pending_action else None
        tool_result: object | None = None
        if isinstance(tool_payload, dict):
            # Emit tool start trace
            await self._emit_trace(
                thread_id=run.thread_external_id,
                run_id=run.external_id,
                kind=TraceStepKind.TOOL_START,
                summary=f"Executing approved tool: {action_label}",
                detail_json=json.dumps({"tool": action_label, "input": tool_payload}),
            )
            try:
                tool_result = await execute_tool_call(action_label, tool_payload)
            except Exception as exc:
                await self._emit_trace(
                    thread_id=run.thread_external_id,
                    run_id=run.external_id,
                    kind=TraceStepKind.TOOL_FAILURE,
                    summary=f"Tool {action_label} failed: {str(exc)[:200]}",
                )
                await self._mark_run_error(run=run, message=str(exc))
                failed = await self._store.get_run(run.external_id)
                if not failed:
                    raise HTTPException(status_code=500, detail="Run state missing after tool failure")
                return ApprovalDecisionResponse(approval=approval, run=failed)

            await self._store.append_stream_event(
                run_id=run.external_id,
                event="tool.completed",
                created_at=_now_ms(),
                data={"name": action_label, "result": self._serialize_tool_result(tool_result)},
            )
            await self._emit_trace(
                thread_id=run.thread_external_id,
                run_id=run.external_id,
                kind=TraceStepKind.TOOL_COMPLETION,
                summary=f"Tool {action_label} completed successfully.",
                detail_json=json.dumps({"tool": action_label, "result": self._serialize_tool_result(tool_result)}),
            )
            await self._append_message(
                thread_id=run.thread_external_id,
                run_id=run.external_id,
                role="tool",
                status="final",
                blocks=[text_block(f"{action_label}: {self._tool_result_text(tool_result)}")],
            )
        else:
            await self._append_message(
                thread_id=run.thread_external_id,
                run_id=run.external_id,
                role="tool",
                status="final",
                blocks=[text_block(f"Approved action executed: {action_label}")],
            )

        await self._store.append_stream_event(
            run_id=run.external_id,
            event="assistant.stream_started",
            created_at=_now_ms(),
            data={},
        )

        # Emit thinking trace for post-approval summarization
        await self._emit_trace(
            thread_id=run.thread_external_id,
            run_id=run.external_id,
            kind=TraceStepKind.THINKING,
            summary="Summarizing approved action outcome.",
        )

        await self._execute_text_run(
            run=run,
            user_input=(
                f"Approved tool `{action_label}` executed.\n"
                f"Arguments: {json.dumps(tool_payload)}\n"
                f"Result: {json.dumps(self._serialize_tool_result(tool_result))}\n"
                "Summarize the outcome and any next steps."
            ),
            max_tokens=700,
        )

        resolved_run = await self._store.get_run(run.external_id)
        if not resolved_run:
            raise HTTPException(status_code=500, detail="Run state missing after approval execution")
        return ApprovalDecisionResponse(approval=approval, run=resolved_run)

    async def _pause_for_approval(self, *, run: RunRecord, action: ToolAction, streaming_message: MessageRecord | None = None) -> RunRecord:
        decision = self._policy.evaluate(action)
        now = _now_ms()
        approval = ApprovalRecord(
            external_id=f"approval_{uuid4().hex}",
            thread_external_id=run.thread_external_id,
            run_external_id=run.external_id,
            status=ApprovalStatus.PENDING,
            action_type=action.action_class.value,
            title=_make_approval_title(action),
            summary=decision.reason,
            risk_level=decision.risk_level,
            payload_json=json.dumps(action.model_dump()),
            requested_at=now,
            updated_at=now,
        )
        run = run.model_copy(
            update={
                "status": RunStatus.PAUSED_APPROVAL,
                "summary": "Paused pending approval.",
                "updated_at": now,
            }
        )

        await self._store.upsert_approval(approval)
        await self._sync.upsert_approval(approval)
        await self._store.set_pending_action(run.external_id, action)
        await self._store.upsert_run(run)
        await self._sync.upsert_run(run)

        if not streaming_message:
            await self._append_message(
                thread_id=run.thread_external_id,
                run_id=run.external_id,
                role="assistant",
                status="final",
                blocks=[text_block("This action requires approval before execution.")],
            )
        await self._store.append_stream_event(
            run_id=run.external_id,
            event="approval.requested",
            created_at=now,
            data={
                "approval_id": approval.external_id,
                "action_type": approval.action_type,
                "risk_level": approval.risk_level.value,
            },
        )
        await self._store.append_stream_event(
            run_id=run.external_id,
            event="run.paused",
            created_at=now,
            data={"status": run.status.value},
        )

        # Emit approval pause trace
        await self._emit_trace(
            thread_id=run.thread_external_id,
            run_id=run.external_id,
            kind=TraceStepKind.APPROVAL_PAUSE,
            summary=f"Waiting for approval: {action.name}",
            detail_json=json.dumps({
                "action": action.name,
                "risk_level": decision.risk_level.value,
                "reason": decision.reason,
            }),
            status="waiting",
        )

        return run

    async def _execute_run(self, *, run: RunRecord, user_input: str, max_tokens: int) -> None:
        await self._store.append_stream_event(
            run_id=run.external_id,
            event="assistant.stream_started",
            created_at=_now_ms(),
            data={},
        )

        if hasattr(self._adapter, "run_agent"):
            await self._execute_tool_aware_run(run=run, user_input=user_input)
            return

        action = infer_tool_action_from_text(user_input)
        if action:
            await self._store.append_stream_event(
                run_id=run.external_id,
                event="tool.planned",
                created_at=_now_ms(),
                data={"name": action.name, "class": action.action_class.value},
            )
            # Emit tool selection trace
            await self._emit_trace(
                thread_id=run.thread_external_id,
                run_id=run.external_id,
                kind=TraceStepKind.TOOL_SELECTION,
                summary=f"Selected tool: {action.name} ({action.action_class.value})",
            )

        if action and self._policy.evaluate(action).requires_approval:
            await self._pause_for_approval(run=run, action=action)
            return

        # Emit thinking trace for text generation
        await self._emit_trace(
            thread_id=run.thread_external_id,
            run_id=run.external_id,
            kind=TraceStepKind.THINKING,
            summary="Generating response.",
        )

        await self._execute_text_run(run=run, user_input=user_input, max_tokens=max_tokens)

    async def _execute_tool_aware_run(self, *, run: RunRecord, user_input: str) -> None:
        expectation = infer_request_tool_expectation(user_input)
        try:
            result = await self._adapter.run_agent(user_prompt=user_input)
        except Exception as exc:
            await self._emit_trace(
                thread_id=run.thread_external_id,
                run_id=run.external_id,
                kind=TraceStepKind.RUN_ERROR,
                summary=f"Agent execution failed: {str(exc)[:200]}",
            )
            await self._mark_run_error(run=run, message=str(exc))
            return

        retried = False
        if self._should_retry_tool_aware_result(user_input=user_input, result_text=result.final_text, tool_traces=result.tool_traces, expectation=expectation):
            retried = True
            await self._store.append_stream_event(
                run_id=run.external_id,
                event="guardrail.retry",
                created_at=_now_ms(),
                data={
                    "kind": expectation.kind if expectation else "unknown",
                    "reason": "relevant_tools_not_used",
                },
            )
            # Emit guardrail retry trace
            await self._emit_trace(
                thread_id=run.thread_external_id,
                run_id=run.external_id,
                kind=TraceStepKind.GUARDRAIL_RETRY,
                summary="Retrying: relevant tools were not used in first attempt.",
                detail_json=json.dumps({"kind": expectation.kind if expectation else "unknown"}),
            )
            try:
                result = await self._adapter.run_agent(
                    user_prompt=user_input,
                    system_prompt=self._retry_system_prompt(expectation),
                )
            except Exception as exc:
                await self._mark_run_error(run=run, message=str(exc))
                return

        result = self._normalize_tool_aware_result(
            result=result,
            expectation=expectation,
            was_retried=retried,
        )

        # Create a streaming assistant placeholder before first delta
        assistant_msg = await self._begin_streaming_assistant_message(run=run)

        latest_text = ""
        for partial_text in result.text_deltas:
            latest_text = partial_text
            assistant_msg = await self._patch_streaming_assistant_message(
                assistant_msg, latest_text
            )
            await self._store.append_stream_event(
                run_id=run.external_id,
                event="assistant.delta",
                created_at=_now_ms(),
                data={"text": partial_text},
            )

        for trace in result.tool_traces:
            await self._store.append_stream_event(
                run_id=run.external_id,
                event="tool.planned",
                created_at=_now_ms(),
                data={"name": trace.name, "input": trace.tool_input},
            )
            # Emit tool selection trace
            await self._emit_trace(
                thread_id=run.thread_external_id,
                run_id=run.external_id,
                kind=TraceStepKind.TOOL_SELECTION,
                summary=f"Using tool: {trace.name}",
                detail_json=json.dumps({"tool": trace.name, "input": trace.tool_input}),
            )
            if trace.result is not None:
                is_error = trace.is_error
                await self._store.append_stream_event(
                    run_id=run.external_id,
                    event="tool.completed" if not is_error else "tool.failed",
                    created_at=_now_ms(),
                    data={
                        "name": trace.name,
                        "result": self._serialize_tool_result(trace.result),
                        "is_error": is_error,
                    },
                )
                # Emit tool completion/failure trace
                await self._emit_trace(
                    thread_id=run.thread_external_id,
                    run_id=run.external_id,
                    kind=TraceStepKind.TOOL_FAILURE if is_error else TraceStepKind.TOOL_COMPLETION,
                    summary=(
                        f"Tool {trace.name} failed: {self._tool_result_text(trace.result)[:200]}"
                        if is_error
                        else f"Tool {trace.name} completed."
                    ),
                    detail_json=json.dumps({
                        "tool": trace.name,
                        "result": self._serialize_tool_result(trace.result),
                        "is_error": is_error,
                    }),
                )

        if result.blocked_action:
            # Finalize the streaming message before pausing
            final_text = latest_text or "This action requires approval before execution."
            await self._patch_streaming_assistant_message(
                assistant_msg, final_text, status="final"
            )
            await self._pause_for_approval(run=run, action=result.blocked_action, streaming_message=assistant_msg)
            return

        final_text = result.final_text or latest_text or "I finished the run but produced no text output."
        await self._finalize_successful_run(
            run=run, text=final_text, streaming_message=assistant_msg
        )

    async def _execute_text_run(self, *, run: RunRecord, user_input: str, max_tokens: int) -> None:
        # Create a streaming assistant placeholder before first delta
        assistant_msg = await self._begin_streaming_assistant_message(run=run)

        latest_text = ""
        try:
            async for partial_text in self._adapter.stream_text(
                user_prompt=user_input,
                max_tokens=max_tokens,
            ):
                latest_text = partial_text
                assistant_msg = await self._patch_streaming_assistant_message(
                    assistant_msg, latest_text
                )
                await self._store.append_stream_event(
                    run_id=run.external_id,
                    event="assistant.delta",
                    created_at=_now_ms(),
                    data={"text": partial_text},
                )
        except Exception as exc:
            # Finalize the streaming message as error before marking run error
            await self._patch_streaming_assistant_message(
                assistant_msg,
                latest_text or f"Error: {exc}",
                status="final",
            )
            await self._emit_trace(
                thread_id=run.thread_external_id,
                run_id=run.external_id,
                kind=TraceStepKind.RUN_ERROR,
                summary=f"Text generation failed: {str(exc)[:200]}",
            )
            await self._mark_run_error(run=run, message=str(exc))
            return

        await self._finalize_successful_run(
            run=run, text=latest_text, streaming_message=assistant_msg
        )

    async def _begin_streaming_assistant_message(
        self, *, run: RunRecord
    ) -> MessageRecord:
        """Create an empty assistant message placeholder before the first delta."""
        now = _now_ms()
        sequence = await self._store.next_sequence(run.thread_external_id)
        message = MessageRecord(
            external_id=f"msg_{uuid4().hex}",
            thread_external_id=run.thread_external_id,
            run_external_id=run.external_id,
            role="assistant",
            status="streaming",
            sequence_number=sequence,
            plain_text="",
            content_blocks=[text_block("")],
            created_at=now,
            updated_at=now,
        )
        await self._store.append_message(message)
        await self._sync.append_message(message)
        return message

    async def _patch_streaming_assistant_message(
        self,
        message: MessageRecord,
        text: str,
        *,
        status: str = "streaming",
    ) -> MessageRecord:
        """Patch the existing streaming assistant message in place by external_id."""
        updated = message.model_copy(
            update={
                "status": status,
                "plain_text": text,
                "content_blocks": [text_block(text)],
                "updated_at": _now_ms(),
            }
        )
        await self._store.append_message(updated)
        await self._sync.append_message(updated)
        return updated

    async def _finalize_successful_run(
        self,
        *,
        run: RunRecord,
        text: str,
        streaming_message: MessageRecord | None = None,
    ) -> None:
        run_summary = summarize_text_for_run(text)
        thread_summary = summarize_text_for_thread(text)
        action_items = extract_action_items(text)

        if streaming_message is not None:
            # Patch the existing streaming message to final status instead of
            # creating a new assistant message row.
            assistant_message = await self._patch_streaming_assistant_message(
                streaming_message, text, status="final"
            )
        else:
            # Legacy path: create a new final assistant message (e.g. rejection).
            assistant_message = await self._append_message(
                thread_id=run.thread_external_id,
                run_id=run.external_id,
                role="assistant",
                status="final",
                blocks=[text_block(text)],
            )

        artifact = make_report_artifact(
            external_id=f"artifact_{uuid4().hex}",
            thread_id=run.thread_external_id,
            run_id=run.external_id,
            title="Response",
            summary=run_summary,
            report_text=text,
            sort_order=1,
        )
        await self._store.upsert_artifact(artifact)
        await self._sync.upsert_artifact(artifact)
        await self._store.append_stream_event(
            run_id=run.external_id,
            event="artifact.created",
            created_at=_now_ms(),
            data={"artifact_id": artifact.external_id, "kind": artifact.kind.value},
        )

        # Emit artifact generation trace
        await self._emit_trace(
            thread_id=run.thread_external_id,
            run_id=run.external_id,
            kind=TraceStepKind.ARTIFACT_GENERATION,
            summary=f"Generated artifact: {artifact.title}",
            detail_json=json.dumps({"artifact_id": artifact.external_id, "kind": artifact.kind.value}),
        )

        if action_items:
            checklist = make_checklist_artifact(
                external_id=f"artifact_{uuid4().hex}",
                thread_id=run.thread_external_id,
                run_id=run.external_id,
                title="Next Steps",
                summary=f"{len(action_items)} action items",
                items=action_items,
                sort_order=2,
            )
            await self._store.upsert_artifact(checklist)
            await self._sync.upsert_artifact(checklist)
            await self._store.append_stream_event(
                run_id=run.external_id,
                event="artifact.created",
                created_at=_now_ms(),
                data={"artifact_id": checklist.external_id, "kind": checklist.kind.value},
            )

        now = _now_ms()
        completed = run.model_copy(
            update={
                "status": RunStatus.COMPLETED,
                "summary": run_summary,
                "completed_at": now,
                "updated_at": now,
                "latest_message_sequence": assistant_message.sequence_number,
            }
        )
        await self._store.upsert_run(completed)
        await self._sync.upsert_run(completed)
        await self._update_thread_summary(
            thread_id=run.thread_external_id,
            summary=thread_summary,
            updated_at=now,
        )
        await self._store.append_stream_event(
            run_id=run.external_id,
            event="run.completed",
            created_at=now,
            data={"status": completed.status.value},
        )

        # Emit run completed trace
        await self._emit_trace(
            thread_id=run.thread_external_id,
            run_id=run.external_id,
            kind=TraceStepKind.RUN_COMPLETED,
            summary=run_summary,
        )

    async def _mark_run_error(self, *, run: RunRecord, message: str) -> None:
        now = _now_ms()
        failed = run.model_copy(
            update={
                "status": RunStatus.ERROR,
                "error_message": message,
                "updated_at": now,
                "completed_at": now,
            }
        )
        await self._store.upsert_run(failed)
        await self._sync.upsert_run(failed)
        await self._store.append_stream_event(
            run_id=run.external_id,
            event="run.error",
            created_at=now,
            data={"message": message},
        )

        # Emit run error trace
        await self._emit_trace(
            thread_id=run.thread_external_id,
            run_id=run.external_id,
            kind=TraceStepKind.RUN_ERROR,
            summary=f"Run failed: {message[:200]}",
        )

    async def _emit_trace(
        self,
        *,
        thread_id: str,
        run_id: str,
        kind: TraceStepKind,
        summary: str,
        detail_json: str | None = None,
        status: str = "completed",
    ) -> TraceStepRecord:
        seq = await self._store.next_trace_sequence(run_id)
        trace = make_trace_step(
            external_id=f"trace_{uuid4().hex}",
            thread_id=thread_id,
            run_id=run_id,
            kind=kind,
            sequence_number=seq,
            summary=summary,
            detail_json=detail_json,
            status=status,
        )
        await self._store.append_trace(trace)
        await self._sync.append_trace(trace)

        # Also emit as a stream event so live consumers see it
        await self._store.append_stream_event(
            run_id=run_id,
            event="trace.step",
            created_at=trace.created_at,
            data={
                "trace_id": trace.external_id,
                "kind": kind.value,
                "summary": summary,
                "status": status,
                "sequence": seq,
            },
        )
        return trace

    async def _append_message(
        self,
        *,
        thread_id: str,
        run_id: str,
        role: str,
        status: str,
        blocks: list,
    ) -> MessageRecord:
        now = _now_ms()
        sequence = await self._store.next_sequence(thread_id)
        message = MessageRecord(
            external_id=f"msg_{uuid4().hex}",
            thread_external_id=thread_id,
            run_external_id=run_id,
            role=role,
            status=status,
            sequence_number=sequence,
            plain_text="\n".join(block.text for block in blocks if block.text).strip() or None,
            content_blocks=blocks,
            created_at=now,
            updated_at=now,
        )
        await self._store.append_message(message)
        await self._sync.append_message(message)
        await self._store.append_stream_event(
            run_id=run_id,
            event="message.created",
            created_at=now,
            data={"message_id": message.external_id, "role": role, "sequence": sequence},
        )

        thread = await self._store.get_thread(thread_id)
        if thread:
            updated_thread = thread.model_copy(update={"last_message_at": now, "updated_at": now})
            await self._store.upsert_thread(updated_thread)
            await self._sync.upsert_thread(updated_thread)

        return message

    async def _update_thread_summary(self, *, thread_id: str, summary: str, updated_at: int) -> None:
        thread = await self._store.get_thread(thread_id)
        if not thread:
            return

        updated_thread = thread.model_copy(update={"summary": summary, "updated_at": updated_at})
        await self._store.upsert_thread(updated_thread)
        await self._sync.upsert_thread(updated_thread)

    def _hydrate_thread_state(self, state: dict) -> ThreadStateResponse:
        thread_data = state.get("thread")
        if not isinstance(thread_data, dict):
            raise HTTPException(status_code=404, detail="Thread state payload missing thread")

        thread = self._hydrate_thread_record(thread_data)

        runs = [
            RunRecord(
                external_id=str(item.get("external_id")),
                thread_external_id=thread.external_id,
                status=item.get("status", "running"),
                trigger_source=item.get("trigger_source", "web"),
                mode=item.get("mode"),
                initiated_by_user_id=item.get("initiated_by_user_id"),
                model=item.get("model"),
                summary=item.get("summary"),
                error_message=item.get("error_message"),
                started_at=item.get("started_at") or _now_ms(),
                completed_at=item.get("completed_at"),
                updated_at=item.get("updated_at") or _now_ms(),
                latest_message_sequence=item.get("latest_message_sequence"),
            )
            for item in state.get("runs", [])
            if isinstance(item, dict)
        ]

        messages = [
            MessageRecord(
                external_id=str(item.get("external_id")),
                thread_external_id=thread.external_id,
                run_external_id=item.get("run_id") and str(item.get("run_id")),
                role=item.get("role", "assistant"),
                status=item.get("status", "final"),
                sequence_number=item.get("sequence_number", 0),
                plain_text=item.get("plain_text"),
                content_blocks=item.get("content_blocks", []),
                created_at=item.get("created_at") or _now_ms(),
                updated_at=item.get("updated_at") or _now_ms(),
            )
            for item in state.get("messages", [])
            if isinstance(item, dict)
        ]

        artifacts = [
            ArtifactRecord(
                external_id=str(item.get("external_id")),
                thread_external_id=thread.external_id,
                run_external_id=item.get("run_id") and str(item.get("run_id")),
                kind=item.get("kind", "report"),
                status=item.get("status", "ready"),
                sort_order=item.get("sort_order", 0),
                title=item.get("title"),
                summary=item.get("summary"),
                content_blocks=item.get("content_blocks", []),
                created_at=item.get("created_at") or _now_ms(),
                updated_at=item.get("updated_at") or _now_ms(),
            )
            for item in state.get("artifacts", [])
            if isinstance(item, dict)
        ]

        approvals = [
            ApprovalRecord(
                external_id=str(item.get("external_id")),
                thread_external_id=thread.external_id,
                run_external_id=str(item.get("run_id")),
                status=item.get("status", "pending"),
                action_type=item.get("action_type", "write"),
                title=item.get("title", "Approval"),
                summary=item.get("summary"),
                risk_level=item.get("risk_level", "medium"),
                payload_json=item.get("payload_json"),
                requested_at=item.get("requested_at") or _now_ms(),
                expires_at=item.get("expires_at"),
                resolved_at=item.get("resolved_at"),
                decision_note=item.get("decision_note"),
                decided_by_user_id=item.get("decided_by_user_id"),
                updated_at=item.get("updated_at") or _now_ms(),
            )
            for item in state.get("approvals", [])
            if isinstance(item, dict)
        ]

        context_links = [
            ContextLinkRecord(
                link_key=str(item.get("link_key")),
                relation=item.get("relation", "context"),
                entity_type=item.get("entity_type", "event"),
                entity_id=item.get("entity_id", ""),
                label=item.get("label"),
                url=item.get("url"),
                metadata_json=item.get("metadata_json"),
                created_at=item.get("created_at") or _now_ms(),
                updated_at=item.get("updated_at") or _now_ms(),
            )
            for item in state.get("context_links", [])
            if isinstance(item, dict)
        ]

        traces = [
            TraceStepRecord(
                external_id=str(item.get("external_id")),
                thread_external_id=thread.external_id,
                run_external_id=str(item.get("run_external_id", item.get("run_id", ""))),
                kind=item.get("kind", "thinking"),
                sequence_number=item.get("sequence_number", 0),
                summary=item.get("summary", ""),
                detail_json=item.get("detail_json"),
                status=item.get("status", "completed"),
                created_at=item.get("created_at") or _now_ms(),
                updated_at=item.get("updated_at") or _now_ms(),
            )
            for item in state.get("traces", [])
            if isinstance(item, dict)
        ]

        return ThreadStateResponse(
            thread=thread,
            runs=runs,
            messages=messages,
            artifacts=artifacts,
            approvals=approvals,
            context_links=context_links,
            traces=traces,
        )

    def _hydrate_thread_record(self, item: dict) -> ThreadRecord:
        return ThreadRecord(
            external_id=str(item.get("external_id")),
            channel=item.get("channel", "web"),
            status=item.get("status", "active"),
            title=item.get("title"),
            summary=item.get("summary"),
            created_by_user_id=item.get("created_by_user_id"),
            last_message_at=item.get("last_message_at"),
            last_run_started_at=item.get("last_run_started_at"),
            archived_at=item.get("archived_at"),
            created_at=item.get("created_at") or _now_ms(),
            updated_at=item.get("updated_at") or _now_ms(),
        )

    def _serialize_tool_result(self, result: object) -> object:
        if isinstance(result, (dict, list, str, int, float, bool)) or result is None:
            return result
        return str(result)

    def _tool_result_text(self, result: object) -> str:
        serialized = self._serialize_tool_result(result)
        if isinstance(serialized, str):
            return serialized
        return json.dumps(serialized)

    def _should_retry_tool_aware_result(
        self,
        *,
        user_input: str,
        result_text: str,
        tool_traces: list,
        expectation: RequestToolExpectation | None,
    ) -> bool:
        if expectation is None:
            return False
        if not looks_like_fake_limitation(result_text or ""):
            return False
        return not attempted_relevant_tools(
            (trace.name for trace in tool_traces),
            expectation,
        )

    def _retry_system_prompt(self, expectation: RequestToolExpectation | None) -> str:
        instruction = (
            expectation.retry_instruction
            if expectation is not None
            else "Relevant MCP tools are available. Use them before answering."
        )
        extra = (
            "Relevant MCP tools are available for this request. "
            "Use them before answering. "
            "Do not claim access limitations unless a tool actually fails."
        )
        return f"{DEFAULT_SYSTEM_PROMPT}\n\n{extra}\n{instruction}"

    def _normalize_tool_aware_result(
        self,
        *,
        result,
        expectation: RequestToolExpectation | None,
        was_retried: bool,
    ):
        if expectation is None:
            return result

        relevant_names = set(expectation.relevant_tools)
        relevant_traces = [trace for trace in result.tool_traces if trace.name in relevant_names]
        failed_traces = [trace for trace in relevant_traces if trace.is_error]

        if failed_traces:
            first_failure = failed_traces[0]
            failure_detail = self._tool_result_text(first_failure.result)
            result.final_text = (
                f"I couldn't complete this request because the MCP tool `{first_failure.name}` failed: "
                f"{failure_detail}."
            )
            result.text_deltas = [result.final_text]
            return result

        if expectation.kind in {"latest_event_attendance", "latest_event_stats"}:
            event_list_trace = next((trace for trace in relevant_traces if trace.name == "list_events"), None)
            if event_list_trace and isinstance(event_list_trace.result, list) and not event_list_trace.result:
                result.final_text = expectation.no_data_message or "I couldn't find any matching data."
                result.text_deltas = [result.final_text]
                return result

        if was_retried and looks_like_fake_limitation(result.final_text or "") and not attempted_relevant_tools(
            (trace.name for trace in result.tool_traces),
            expectation,
        ):
            tools = ", ".join(f"`{tool}`" for tool in expectation.relevant_tools)
            result.final_text = (
                "I couldn't complete this request because the runtime did not successfully use the "
                f"expected MCP tools ({tools}). Please retry after confirming the runtime MCP path is healthy."
            )
            result.text_deltas = [result.final_text]

        return result
