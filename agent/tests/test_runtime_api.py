from __future__ import annotations

from fastapi.testclient import TestClient

from runtime.api import build_app
from runtime.service import AgentRuntimeService
from runtime.store import InMemoryRuntimeStore


class FakeAdapter:
    model = "fake-model"

    async def stream_text(self, *, messages: list, system_prompt: str | None = None, max_tokens: int = 900):
        _ = (messages, system_prompt, max_tokens)
        yield "Step 1"
        yield "Done: response"


def test_runtime_api_agent_thread_run_stream_and_approval_flow() -> None:
    service = AgentRuntimeService(store=InMemoryRuntimeStore(), adapter=FakeAdapter())
    app = build_app(service)

    client = TestClient(app)

    thread_resp = client.post(
        "/agent/threads",
        json={"channel": "web", "title": "API Thread"},
    )
    assert thread_resp.status_code == 200
    agent_thread_id = thread_resp.json()["external_id"]

    run_resp = client.post(
        "/agent/runs",
        json={
            "thread_id": agent_thread_id,
            "input_text": "Send email to finalists",
            "trigger_source": "web",
        },
    )
    assert run_resp.status_code == 200
    run_body = run_resp.json()
    assert run_body["run"]["status"] == "paused_approval"
    event_names = [e["event"] for e in run_body["events"]]
    assert "approval.requested" in event_names
    assert "provider_event" not in event_names

    approval_id = next(
        e["data"]["approval_id"]
        for e in run_body["events"]
        if e["event"] == "approval.requested"
    )

    state_resp = client.get(f"/agent/threads/{agent_thread_id}")
    assert state_resp.status_code == 200

    approval_resp = client.post(
        f"/agent/approvals/{approval_id}",
        json={"decision": "approved"},
    )
    assert approval_resp.status_code == 200
    assert approval_resp.json()["approval"]["status"] == "approved"
    assert approval_resp.json()["run"]["status"] == "completed"


def test_runtime_api_lists_agent_threads() -> None:
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
