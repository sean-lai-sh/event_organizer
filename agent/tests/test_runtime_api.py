from __future__ import annotations

from fastapi.testclient import TestClient

from runtime.api import build_app
from runtime.service import AgentRuntimeService
from runtime.store import InMemoryRuntimeStore


class FakeAdapter:
    model = "fake-model"

    async def stream_text(self, *, user_prompt: str, system_prompt: str | None = None, max_tokens: int = 900):
        _ = (system_prompt, max_tokens)
        yield "Step 1"
        yield f"Done: {user_prompt[:15]}"


def test_runtime_api_thread_run_stream_and_approval_flow() -> None:
    service = AgentRuntimeService(store=InMemoryRuntimeStore(), adapter=FakeAdapter())
    app = build_app(service)

    client = TestClient(app)

    thread_resp = client.post(
        "/agent/threads",
        json={"channel": "web", "title": "API Thread"},
    )
    assert thread_resp.status_code == 200
    thread_id = thread_resp.json()["external_id"]

    run_resp = client.post(
        "/agent/runs",
        json={
            "thread_id": thread_id,
            "input_text": "Send email to finalists",
            "trigger_source": "web",
        },
    )
    assert run_resp.status_code == 200
    run_id = run_resp.json()["external_id"]
    assert run_resp.json()["status"] == "paused_approval"

    stream_resp = client.get(f"/agent/runs/{run_id}/stream")
    assert stream_resp.status_code == 200
    assert "approval.requested" in stream_resp.text
    assert "provider_event" not in stream_resp.text

    state_resp = client.get(f"/agent/threads/{thread_id}")
    assert state_resp.status_code == 200
    approvals = state_resp.json()["approvals"]
    assert len(approvals) == 1
    approval_id = approvals[0]["external_id"]

    approval_resp = client.post(
        f"/agent/approvals/{approval_id}",
        json={"decision": "approved"},
    )
    assert approval_resp.status_code == 200
    assert approval_resp.json()["approval"]["status"] == "approved"
    assert approval_resp.json()["run"]["status"] == "completed"


def test_runtime_api_lists_threads() -> None:
    service = AgentRuntimeService(store=InMemoryRuntimeStore(), adapter=FakeAdapter())
    app = build_app(service)

    client = TestClient(app)

    first = client.post("/agent/threads", json={"channel": "web", "title": "First thread"})
    second = client.post("/agent/threads", json={"channel": "web", "title": "Second thread"})

    assert first.status_code == 200
    assert second.status_code == 200

    list_resp = client.get("/agent/threads")
    assert list_resp.status_code == 200

    titles = [thread["title"] for thread in list_resp.json()]
    assert titles == ["Second thread", "First thread"]
