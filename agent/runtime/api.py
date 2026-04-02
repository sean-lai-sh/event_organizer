from __future__ import annotations

from fastapi import FastAPI, Query

from .contracts import (
    ApprovalDecisionRequest,
    ApprovalDecisionResponse,
    RunCreateRequest,
    RunWithEventsResponse,
    ThreadCreateRequest,
    ThreadRecord,
    ThreadStateResponse,
)
from .service import AgentRuntimeService


def build_app(service: AgentRuntimeService | None = None) -> FastAPI:
    runtime = service or AgentRuntimeService()

    app = FastAPI(
        title="Event Organizer Agent Runtime",
        version="0.1.0",
        description="Canonical Modal-hosted conversational runtime endpoints.",
    )

    @app.get("/agent/threads", response_model=list[ThreadRecord])
    async def list_threads(limit: int = Query(default=50, ge=1, le=200)) -> list[ThreadRecord]:
        return await runtime.list_threads(limit=limit)

    @app.post("/agent/threads", response_model=ThreadRecord)
    async def create_thread(payload: ThreadCreateRequest) -> ThreadRecord:
        return await runtime.create_thread(payload)

    @app.get("/agent/threads/{thread_id}", response_model=ThreadStateResponse)
    async def get_thread(thread_id: str) -> ThreadStateResponse:
        return await runtime.get_thread_state(thread_id)

    @app.post("/agent/runs", response_model=RunWithEventsResponse)
    async def start_run(payload: RunCreateRequest) -> RunWithEventsResponse:
        return await runtime.start_run(payload)

    @app.post("/agent/approvals/{approval_id}", response_model=ApprovalDecisionResponse)
    async def submit_approval(approval_id: str, payload: ApprovalDecisionRequest) -> ApprovalDecisionResponse:
        return await runtime.submit_approval(approval_id, payload)

    return app
