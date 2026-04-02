from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import FastAPI, Query
from fastapi.responses import StreamingResponse

from .contracts import (
    ApprovalDecisionRequest,
    ApprovalDecisionResponse,
    RunCreateRequest,
    RunRecord,
    ThreadCreateRequest,
    ThreadRecord,
    ThreadStateResponse,
)
from .normalize import as_sse
from .service import AgentRuntimeService


def build_app(service: AgentRuntimeService | None = None) -> FastAPI:
    runtime = service or AgentRuntimeService()

    app = FastAPI(
        title="Event Organizer Agent Runtime",
        version="0.1.0",
        description="Canonical Modal-hosted conversational runtime endpoints.",
    )

    @app.post("/agent/threads", response_model=ThreadRecord)
    async def create_thread(payload: ThreadCreateRequest) -> ThreadRecord:
        return await runtime.create_thread(payload)

    @app.get("/agent/threads/{thread_id}", response_model=ThreadStateResponse)
    async def get_thread(thread_id: str) -> ThreadStateResponse:
        return await runtime.get_thread_state(thread_id)

    @app.post("/agent/runs", response_model=RunRecord)
    async def start_run(payload: RunCreateRequest) -> RunRecord:
        return await runtime.start_run(payload)

    @app.get("/agent/runs/{run_id}/stream")
    async def stream_run(
        run_id: str,
        after_sequence: int = Query(default=0, ge=0),
    ) -> StreamingResponse:
        async def event_source() -> AsyncIterator[str]:
            events = await runtime.list_run_events(run_id, after_sequence=after_sequence)
            for event in events:
                yield as_sse(event)

        return StreamingResponse(event_source(), media_type="text/event-stream")

    @app.post("/agent/approvals/{approval_id}", response_model=ApprovalDecisionResponse)
    async def submit_approval(approval_id: str, payload: ApprovalDecisionRequest) -> ApprovalDecisionResponse:
        return await runtime.submit_approval(approval_id, payload)

    return app
