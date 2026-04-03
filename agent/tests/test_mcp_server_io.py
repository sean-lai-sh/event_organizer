from __future__ import annotations

import pytest

from apps.mcp import service as mcp_service


def _sample_record(record_id: str = "rec_123") -> dict:
    return {
        "id": {"record_id": record_id},
        "created_at": "2026-04-01T00:00:00Z",
        "values": {
            "name": [{"first_name": "Ada", "last_name": "Lovelace"}],
            "email_addresses": [{"email_address": "ada@example.com"}],
            "phone_numbers": [{"phone_number": "+1-555-0100"}],
            "career_profile": [{"value": "{\"skills\": [\"python\"]}"}],
            "relationship_stage": [{"value": "active"}],
            "contact_source": [{"value": "warm_intro"}],
            "warm_intro_by": [{"value": "Grace"}],
            "assigned_members": [{"value": "[\"owner@example.com\"]"}],
            "contact_type": [{"value": "speaker"}],
            "outreach_status": [{"value": "agent_active"}],
            "enrichment_status": [{"value": "enriched"}],
            "last_agent_action_at": [{"value": "2026-04-01T12:00:00Z"}],
        },
    }


class FakeAttioClient:
    def __init__(self, state: dict) -> None:
        self.state = state

    async def __aenter__(self) -> "FakeAttioClient":
        return self

    async def __aexit__(self, *_args) -> None:
        return None

    async def search_contacts(self, filter_: dict, limit: int = 100, offset: int = 0) -> list[dict]:
        self.state["search_calls"].append({"filter": filter_, "limit": limit, "offset": offset})
        return self.state.get("search_result", [])

    async def get_contact(self, record_id: str) -> dict:
        self.state["get_calls"].append(record_id)
        return self.state.get("get_result", _sample_record(record_id))

    async def create_contact(self, values: dict) -> dict:
        self.state["create_calls"].append(values)
        return self.state.get("create_result", _sample_record("created_1"))

    async def update_contact(self, record_id: str, values: dict) -> dict:
        self.state["update_calls"].append({"record_id": record_id, "values": values})
        return self.state.get("update_result", _sample_record(record_id))

    async def create_note(self, record_id: str, title: str, content: str) -> dict:
        self.state["note_calls"].append(
            {"record_id": record_id, "title": title, "content": content}
        )
        return {"id": {"note_id": "note_1"}}


def _install_fake_attio(monkeypatch: pytest.MonkeyPatch, state: dict) -> None:
    monkeypatch.setattr(mcp_service, "AttioClient", lambda: FakeAttioClient(state))


class FakeConvexClient:
    def __init__(self, state: dict) -> None:
        self.state = state

    async def __aenter__(self) -> "FakeConvexClient":
        return self

    async def __aexit__(self, *_args) -> None:
        return None

    async def list_events(self, status: str | None = None, limit: int | None = None) -> list[dict]:
        self.state["list_events_calls"].append({"status": status, "limit": limit})
        rows = self.state.get("list_events_result", [])
        return rows[:limit] if limit is not None else rows

    async def get_event(self, event_id: str) -> dict | None:
        self.state["get_event_calls"].append(event_id)
        return self.state.get("get_event_result")

    async def get_event_inbound_status(self, event_id: str | None = None) -> list[dict]:
        self.state["inbound_status_calls"].append(event_id)
        return self.state.get("inbound_status_result", [])

    async def get_outreach_for_event(self, event_id: str, approved: bool | None = None) -> list[dict]:
        self.state["get_outreach_calls"].append({"event_id": event_id, "approved": approved})
        return self.state.get("outreach_result", [])

    async def get_attendance_dashboard(self) -> dict:
        self.state["dashboard_calls"].append(True)
        return self.state.get("dashboard_result", {})

    async def get_event_attendance(self, event_id: str) -> dict:
        self.state["attendance_calls"].append(event_id)
        return self.state.get("attendance_result", {})

    async def update_event_safe(
        self,
        event_id: str,
        *,
        title: str | None = None,
        description: str | None = None,
        event_date: str | None = None,
        event_time: str | None = None,
        event_end_time: str | None = None,
        location: str | None = None,
        status: str | None = None,
        speaker_confirmed: bool | None = None,
        room_confirmed: bool | None = None,
    ) -> dict | None:
        self.state["update_event_calls"].append(
            {
                "event_id": event_id,
                "title": title,
                "description": description,
                "event_date": event_date,
                "event_time": event_time,
                "event_end_time": event_end_time,
                "location": location,
                "status": status,
                "speaker_confirmed": speaker_confirmed,
                "room_confirmed": room_confirmed,
            }
        )
        return self.state.get("update_event_result")


def _install_fake_convex(monkeypatch: pytest.MonkeyPatch, state: dict) -> None:
    monkeypatch.setattr(mcp_service, "ConvexClient", lambda: FakeConvexClient(state))


@pytest.mark.asyncio
async def test_search_contacts_io(monkeypatch: pytest.MonkeyPatch) -> None:
    state = {
        "search_calls": [],
        "get_calls": [],
        "create_calls": [],
        "update_calls": [],
        "note_calls": [],
        "search_result": [_sample_record("rec_1")],
    }
    _install_fake_attio(monkeypatch, state)

    rows = await mcp_service.search_contacts(
        outreach_status="pending",
        contact_source="warm_intro",
        limit=7,
    )

    assert len(state["search_calls"]) == 1
    call = state["search_calls"][0]
    assert call["limit"] == 7
    assert call["filter"] == {
        "$and": [
            {
                "attribute": {"slug": "outreach_status"},
                "condition": "equals",
                "value": "pending",
            },
            {
                "attribute": {"slug": "contact_source"},
                "condition": "equals",
                "value": "warm_intro",
            },
        ]
    }

    assert rows[0]["id"] == "rec_1"
    assert rows[0]["firstname"] == "Ada"
    assert rows[0]["outreach_status"] == "agent_active"


@pytest.mark.asyncio
async def test_search_contacts_io_without_filters_uses_empty_filter(monkeypatch: pytest.MonkeyPatch) -> None:
    state = {
        "search_calls": [],
        "get_calls": [],
        "create_calls": [],
        "update_calls": [],
        "note_calls": [],
        "search_result": [_sample_record("rec_2")],
    }
    _install_fake_attio(monkeypatch, state)

    rows = await mcp_service.search_contacts(limit=3)

    assert len(state["search_calls"]) == 1
    call = state["search_calls"][0]
    assert call["filter"] == {}
    assert call["limit"] == 3
    assert rows[0]["id"] == "rec_2"


@pytest.mark.asyncio
async def test_get_contact_io(monkeypatch: pytest.MonkeyPatch) -> None:
    state = {
        "search_calls": [],
        "get_calls": [],
        "create_calls": [],
        "update_calls": [],
        "note_calls": [],
        "get_result": _sample_record("rec_777"),
    }
    _install_fake_attio(monkeypatch, state)

    row = await mcp_service.get_contact("rec_777")

    assert state["get_calls"] == ["rec_777"]
    assert row["id"] == "rec_777"
    assert row["email"] == "ada@example.com"


@pytest.mark.asyncio
async def test_create_contact_io(monkeypatch: pytest.MonkeyPatch) -> None:
    state = {
        "search_calls": [],
        "get_calls": [],
        "create_calls": [],
        "update_calls": [],
        "note_calls": [],
        "create_result": _sample_record("created_22"),
    }
    _install_fake_attio(monkeypatch, state)

    created = await mcp_service.create_contact(
        firstname="Ada",
        lastname="Lovelace",
        email="ada@example.com",
        contact_source="warm_intro",
        contact_type="speaker",
        career_profile='{"skills":["python"]}',
        warm_intro_by="Grace Hopper",
        assigned_members='["member@example.com"]',
    )

    assert len(state["create_calls"]) == 1
    values = state["create_calls"][0]
    assert values["name"] == [{"first_name": "Ada", "last_name": "Lovelace"}]
    assert values["email_addresses"] == [{"email_address": "ada@example.com"}]
    assert values["contact_source"] == [{"value": "warm_intro"}]
    assert values["contact_type"] == [{"value": "speaker"}]
    assert values["outreach_status"] == [{"value": "pending"}]
    assert values["career_profile"] == [{"value": '{"skills":["python"]}'}]
    assert values["warm_intro_by"] == [{"value": "Grace Hopper"}]
    assert values["assigned_members"] == [{"value": '["member@example.com"]'}]

    assert created["id"] == "created_22"
    assert created["lastname"] == "Lovelace"


@pytest.mark.asyncio
async def test_update_contact_io_with_note(monkeypatch: pytest.MonkeyPatch) -> None:
    state = {
        "search_calls": [],
        "get_calls": [],
        "create_calls": [],
        "update_calls": [],
        "note_calls": [],
        "update_result": _sample_record("rec_abc"),
    }
    _install_fake_attio(monkeypatch, state)

    updated = await mcp_service.update_contact(
        record_id="rec_abc",
        outreach_status="agent_active",
        relationship_stage="active",
        agent_notes="Reached out and awaiting response",
    )

    assert len(state["note_calls"]) == 1
    note = state["note_calls"][0]
    assert note["record_id"] == "rec_abc"
    assert note["title"] == "Agent Note"
    assert "Reached out and awaiting response" in note["content"]

    assert len(state["update_calls"]) == 1
    update_values = state["update_calls"][0]["values"]
    assert update_values["outreach_status"] == [{"value": "agent_active"}]
    assert update_values["relationship_stage"] == [{"value": "active"}]
    assert "last_agent_action_at" in update_values
    assert isinstance(update_values["last_agent_action_at"][0]["value"], str)

    assert updated["id"] == "rec_abc"
    assert updated["contact_source"] == "warm_intro"


@pytest.mark.asyncio
async def test_update_contact_timestamp_only(monkeypatch: pytest.MonkeyPatch) -> None:
    state = {
        "search_calls": [],
        "get_calls": [],
        "create_calls": [],
        "update_calls": [],
        "note_calls": [],
        "update_result": _sample_record("rec_ts"),
    }
    _install_fake_attio(monkeypatch, state)

    updated = await mcp_service.update_contact(
        record_id="rec_ts",
        last_agent_action_at="2026-04-01T10:11:12Z",
    )

    assert not state["note_calls"]
    assert len(state["update_calls"]) == 1
    update = state["update_calls"][0]
    assert update["record_id"] == "rec_ts"
    assert update["values"] == {
        "last_agent_action_at": [{"value": "2026-04-01T10:11:12Z"}]
    }
    assert updated["id"] == "rec_ts"


@pytest.mark.asyncio
async def test_update_contact_no_updates_reads_contact(monkeypatch: pytest.MonkeyPatch) -> None:
    state = {
        "search_calls": [],
        "get_calls": [],
        "create_calls": [],
        "update_calls": [],
        "note_calls": [],
        "get_result": _sample_record("rec_read"),
    }
    _install_fake_attio(monkeypatch, state)

    updated = await mcp_service.update_contact(record_id="rec_read")

    assert not state["note_calls"]
    assert not state["update_calls"]
    assert state["get_calls"] == ["rec_read"]
    assert updated["id"] == "rec_read"


@pytest.mark.asyncio
async def test_list_events_io(monkeypatch: pytest.MonkeyPatch) -> None:
    state = {
        "list_events_calls": [],
        "get_event_calls": [],
        "inbound_status_calls": [],
        "get_outreach_calls": [],
        "dashboard_calls": [],
        "attendance_calls": [],
        "update_event_calls": [],
        "list_events_result": [
            {"_id": "evt_1", "title": "Hack Night", "status": "draft"},
            {"_id": "evt_2", "title": "Workshop", "status": "outreach"},
        ],
    }
    _install_fake_convex(monkeypatch, state)

    rows = await mcp_service.list_events(status="draft", limit=1)

    assert state["list_events_calls"] == [{"status": "draft", "limit": 1}]
    assert rows == [{"_id": "evt_1", "title": "Hack Night", "status": "draft"}]


@pytest.mark.asyncio
async def test_get_event_io(monkeypatch: pytest.MonkeyPatch) -> None:
    state = {
        "list_events_calls": [],
        "get_event_calls": [],
        "inbound_status_calls": [],
        "get_outreach_calls": [],
        "dashboard_calls": [],
        "attendance_calls": [],
        "update_event_calls": [],
        "get_event_result": {"_id": "evt_7", "title": "Talk Night"},
    }
    _install_fake_convex(monkeypatch, state)

    event = await mcp_service.get_event("evt_7")

    assert state["get_event_calls"] == ["evt_7"]
    assert event == {"_id": "evt_7", "title": "Talk Night"}


@pytest.mark.asyncio
async def test_get_event_outreach_io(monkeypatch: pytest.MonkeyPatch) -> None:
    state = {
        "list_events_calls": [],
        "get_event_calls": [],
        "inbound_status_calls": [],
        "get_outreach_calls": [],
        "dashboard_calls": [],
        "attendance_calls": [],
        "update_event_calls": [],
        "outreach_result": [{"attio_record_id": "rec_1", "response": "pending"}],
    }
    _install_fake_convex(monkeypatch, state)

    rows = await mcp_service.get_event_outreach("evt_7", approved=True)

    assert state["get_outreach_calls"] == [{"event_id": "evt_7", "approved": True}]
    assert rows == [{"attio_record_id": "rec_1", "response": "pending"}]


@pytest.mark.asyncio
async def test_get_event_inbound_status_io(monkeypatch: pytest.MonkeyPatch) -> None:
    state = {
        "list_events_calls": [],
        "get_event_calls": [],
        "inbound_status_calls": [],
        "get_outreach_calls": [],
        "dashboard_calls": [],
        "attendance_calls": [],
        "update_event_calls": [],
        "inbound_status_result": [
            {"event_id": "evt_1", "summary": {"threads": 2}},
        ],
    }
    _install_fake_convex(monkeypatch, state)

    rows = await mcp_service.get_event_inbound_status("evt_1")

    assert state["inbound_status_calls"] == ["evt_1"]
    assert rows == [{"event_id": "evt_1", "summary": {"threads": 2}}]


@pytest.mark.asyncio
async def test_get_attendance_dashboard_io(monkeypatch: pytest.MonkeyPatch) -> None:
    state = {
        "list_events_calls": [],
        "get_event_calls": [],
        "inbound_status_calls": [],
        "get_outreach_calls": [],
        "dashboard_calls": [],
        "attendance_calls": [],
        "update_event_calls": [],
        "dashboard_result": {"totals": {"events_tracked": 2, "unique_attendees": 12}},
    }
    _install_fake_convex(monkeypatch, state)

    dashboard = await mcp_service.get_attendance_dashboard()

    assert state["dashboard_calls"] == [True]
    assert dashboard["totals"]["events_tracked"] == 2


@pytest.mark.asyncio
async def test_get_event_attendance_io(monkeypatch: pytest.MonkeyPatch) -> None:
    state = {
        "list_events_calls": [],
        "get_event_calls": [],
        "inbound_status_calls": [],
        "get_outreach_calls": [],
        "dashboard_calls": [],
        "attendance_calls": [],
        "update_event_calls": [],
        "attendance_result": {
            "event": {"_id": "evt_9", "title": "Workshop"},
            "attendees": [{"email": "ada@example.com"}],
        },
    }
    _install_fake_convex(monkeypatch, state)

    attendance = await mcp_service.get_event_attendance("evt_9")

    assert state["attendance_calls"] == ["evt_9"]
    assert attendance["event"]["title"] == "Workshop"


@pytest.mark.asyncio
async def test_update_event_safe_io(monkeypatch: pytest.MonkeyPatch) -> None:
    state = {
        "list_events_calls": [],
        "get_event_calls": [],
        "inbound_status_calls": [],
        "get_outreach_calls": [],
        "dashboard_calls": [],
        "attendance_calls": [],
        "update_event_calls": [],
        "update_event_result": {"_id": "evt_9", "title": "Updated"},
    }
    _install_fake_convex(monkeypatch, state)

    updated = await mcp_service.update_event_safe(
        event_id="evt_9",
        title="Updated",
        status="outreach",
        speaker_confirmed=True,
        room_confirmed=False,
    )

    assert state["update_event_calls"] == [
        {
            "event_id": "evt_9",
            "title": "Updated",
            "description": None,
            "event_date": None,
            "event_time": None,
            "event_end_time": None,
            "location": None,
            "status": "outreach",
            "speaker_confirmed": True,
            "room_confirmed": False,
        }
    ]
    assert updated == {"_id": "evt_9", "title": "Updated"}


def test_mcp_tool_docstrings_describe_event_and_attendance_uses() -> None:
    assert "newest relevant event" in (mcp_service.list_events.__doc__ or "")
    assert "actual attendance" in (mcp_service.get_event_attendance.__doc__ or "")
    assert "aggregate attendance dashboard" in (mcp_service.get_attendance_dashboard.__doc__ or "")
    assert "specific Convex event" in (mcp_service.get_event_outreach.__doc__ or "")
