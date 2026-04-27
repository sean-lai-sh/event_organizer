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
        },
    }


def _sample_speaker_entry(entry_id: str = "spk_entry_1", parent: str = "rec_parent") -> dict:
    return {
        "id": {"entry_id": entry_id},
        "parent_record_id": parent,
        "created_at": "2026-04-02T00:00:00Z",
        "values": {
            "status": [{"value": "Prospect"}],
            "source": [{"value": "in bound"}],
            "active_event_id": [{"value": "evt_1"}],
        },
    }


class FakeAttioClient:
    def __init__(self, state: dict) -> None:
        self.state = state

    async def __aenter__(self) -> "FakeAttioClient":
        return self

    async def __aexit__(self, *_args) -> None:
        return None

    # ── people ──
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

    # ── speakers ──
    async def search_speaker_entries(
        self, filter_: dict, limit: int = 100, offset: int = 0
    ) -> list[dict]:
        self.state["speaker_search_calls"].append(
            {"filter": filter_, "limit": limit, "offset": offset}
        )
        return self.state.get("speaker_search_result", [])

    async def get_speaker_entry(self, entry_id: str) -> dict:
        self.state["speaker_get_calls"].append(entry_id)
        return self.state.get("speaker_get_result", _sample_speaker_entry(entry_id))

    async def create_speaker_entry(self, values: dict) -> dict:
        self.state["speaker_create_calls"].append(values)
        return self.state.get("speaker_create_result", _sample_speaker_entry("spk_new"))

    async def update_speaker_entry(self, entry_id: str, values: dict) -> dict:
        self.state["speaker_update_calls"].append({"entry_id": entry_id, "values": values})
        return self.state.get(
            "speaker_update_result", _sample_speaker_entry(entry_id)
        )


def _fresh_state() -> dict:
    return {
        "search_calls": [],
        "get_calls": [],
        "create_calls": [],
        "update_calls": [],
        "note_calls": [],
        "speaker_search_calls": [],
        "speaker_get_calls": [],
        "speaker_create_calls": [],
        "speaker_update_calls": [],
    }


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

    async def create_event(self, event: dict) -> str:
        self.state["create_event_calls"].append(event)
        return self.state.get("create_event_result", "new_evt_id")

    async def create_event_safe(
        self,
        *,
        title: str,
        description: str | None = None,
        event_date: str | None = None,
        event_time: str | None = None,
        event_end_time: str | None = None,
        location: str | None = None,
        event_type: str | None = None,
        target_profile: str | None = None,
        needs_outreach: bool | None = None,
        status: str | None = None,
        created_by: str | None = None,
    ) -> str:
        self.state["create_event_safe_calls"].append(
            {
                "title": title,
                "description": description,
                "event_date": event_date,
                "event_time": event_time,
                "event_end_time": event_end_time,
                "location": location,
                "event_type": event_type,
                "target_profile": target_profile,
                "needs_outreach": needs_outreach,
                "status": status,
                "created_by": created_by,
            }
        )
        return self.state.get("create_event_result", "new_evt_id")

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
        event_type: str | None = None,
        target_profile: str | None = None,
        needs_outreach: bool | None = None,
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
                "event_type": event_type,
                "target_profile": target_profile,
                "needs_outreach": needs_outreach,
                "speaker_confirmed": speaker_confirmed,
                "room_confirmed": room_confirmed,
            }
        )
        return self.state.get("update_event_result")


def _install_fake_convex(monkeypatch: pytest.MonkeyPatch, state: dict) -> None:
    monkeypatch.setattr(mcp_service, "ConvexClient", lambda: FakeConvexClient(state))


def _fresh_convex_state() -> dict:
    return {
        "list_events_calls": [],
        "get_event_calls": [],
        "inbound_status_calls": [],
        "get_outreach_calls": [],
        "dashboard_calls": [],
        "attendance_calls": [],
        "update_event_calls": [],
        "create_event_calls": [],
        "create_event_safe_calls": [],
    }


# ── People tools ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_search_people_by_email(monkeypatch: pytest.MonkeyPatch) -> None:
    state = _fresh_state()
    state["search_result"] = [_sample_record("rec_1")]
    _install_fake_attio(monkeypatch, state)

    rows = await mcp_service.search_people(email="ada@example.com", limit=5)

    assert len(state["search_calls"]) == 1
    call = state["search_calls"][0]
    assert call["limit"] == 5
    assert call["filter"] == {
        "$and": [
            {
                "attribute": {"slug": "email_addresses"},
                "condition": "equals",
                "value": "ada@example.com",
            }
        ]
    }
    assert rows[0]["id"] == "rec_1"
    assert rows[0]["email"] == "ada@example.com"


@pytest.mark.asyncio
async def test_search_people_without_filters_returns_empty_filter(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    state = _fresh_state()
    state["search_result"] = [_sample_record("rec_2")]
    _install_fake_attio(monkeypatch, state)

    rows = await mcp_service.search_people(limit=3)

    assert state["search_calls"][0]["filter"] == {}
    assert rows[0]["id"] == "rec_2"


@pytest.mark.asyncio
async def test_get_person(monkeypatch: pytest.MonkeyPatch) -> None:
    state = _fresh_state()
    state["get_result"] = _sample_record("rec_777")
    _install_fake_attio(monkeypatch, state)

    row = await mcp_service.get_person("rec_777")

    assert state["get_calls"] == ["rec_777"]
    assert row["id"] == "rec_777"


@pytest.mark.asyncio
async def test_upsert_person_creates_when_not_found(monkeypatch: pytest.MonkeyPatch) -> None:
    state = _fresh_state()
    state["search_result"] = []  # no existing person
    state["create_result"] = _sample_record("created_22")
    _install_fake_attio(monkeypatch, state)

    created = await mcp_service.upsert_person(
        firstname="Ada",
        lastname="Lovelace",
        email="ada@example.com",
        phone="+1-555-0100",
        company="Analytical Engines",
        job_title="Mathematician",
        description="Pioneering programmer",
    )

    assert len(state["search_calls"]) == 1
    assert len(state["create_calls"]) == 1
    values = state["create_calls"][0]
    # Identity fields only.
    assert values["name"] == [{"first_name": "Ada", "last_name": "Lovelace"}]
    assert values["email_addresses"] == [{"email_address": "ada@example.com"}]
    assert values["phone_numbers"] == [{"phone_number": "+1-555-0100"}]
    assert values["company"] == [{"value": "Analytical Engines"}]
    assert values["job_title"] == [{"value": "Mathematician"}]
    assert values["description"] == [{"value": "Pioneering programmer"}]
    # Workflow fields must NEVER be written on people.
    for forbidden in (
        "outreach_status",
        "contact_source",
        "contact_type",
        "relationship_stage",
        "assigned_members",
        "career_profile",
        "warm_intro_by",
        "last_agent_action_at",
        "enrichment_status",
    ):
        assert forbidden not in values

    assert created["id"] == "created_22"


@pytest.mark.asyncio
async def test_upsert_person_updates_when_found(monkeypatch: pytest.MonkeyPatch) -> None:
    state = _fresh_state()
    state["search_result"] = [_sample_record("rec_existing")]
    state["update_result"] = _sample_record("rec_existing")
    _install_fake_attio(monkeypatch, state)

    result = await mcp_service.upsert_person(
        firstname="Ada",
        lastname="Lovelace",
        email="ada@example.com",
    )

    assert not state["create_calls"]
    assert len(state["update_calls"]) == 1
    update = state["update_calls"][0]
    assert update["record_id"] == "rec_existing"
    assert update["values"]["email_addresses"] == [{"email_address": "ada@example.com"}]
    assert "outreach_status" not in update["values"]
    assert "contact_source" not in update["values"]
    assert result["id"] == "rec_existing"


@pytest.mark.asyncio
async def test_append_person_note(monkeypatch: pytest.MonkeyPatch) -> None:
    state = _fresh_state()
    _install_fake_attio(monkeypatch, state)

    result = await mcp_service.append_person_note(
        record_id="rec_abc",
        note="Reached out and awaiting response",
    )

    assert not state["update_calls"]
    assert len(state["note_calls"]) == 1
    note = state["note_calls"][0]
    assert note["record_id"] == "rec_abc"
    assert note["title"] == "Agent Note"
    assert "Reached out and awaiting response" in note["content"]
    assert result["record_id"] == "rec_abc"


@pytest.mark.asyncio
async def test_upsert_person_requires_email(monkeypatch: pytest.MonkeyPatch) -> None:
    state = _fresh_state()
    _install_fake_attio(monkeypatch, state)

    with pytest.raises(ValueError):
        await mcp_service.upsert_person(firstname="A", lastname="B", email="   ")


# ── Compatibility read aliases ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_search_contacts_compat_alias_still_returns_person_data(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    state = _fresh_state()
    state["search_result"] = [_sample_record("rec_compat")]
    _install_fake_attio(monkeypatch, state)

    rows = await mcp_service.search_contacts(email="ada@example.com", limit=2)

    assert rows[0]["id"] == "rec_compat"
    call = state["search_calls"][0]
    # Compat alias should use the identity email filter, not workflow filters.
    assert call["filter"] == {
        "$and": [
            {
                "attribute": {"slug": "email_addresses"},
                "condition": "equals",
                "value": "ada@example.com",
            }
        ]
    }


@pytest.mark.asyncio
async def test_get_contact_compat_alias_returns_person(monkeypatch: pytest.MonkeyPatch) -> None:
    state = _fresh_state()
    state["get_result"] = _sample_record("rec_compat_one")
    _install_fake_attio(monkeypatch, state)

    row = await mcp_service.get_contact("rec_compat_one")

    assert state["get_calls"] == ["rec_compat_one"]
    assert row["id"] == "rec_compat_one"


def test_create_contact_and_update_contact_are_retired() -> None:
    # The historical workflow-authoritative tools are gone from the MCP surface.
    assert not hasattr(mcp_service, "create_contact")
    assert not hasattr(mcp_service, "update_contact")


# ── Speaker workflow tools ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_search_speakers_normalizes_status_and_source(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    state = _fresh_state()
    state["speaker_search_result"] = [_sample_speaker_entry("spk_1")]
    _install_fake_attio(monkeypatch, state)

    rows = await mcp_service.search_speakers(
        status="ACCEPTED",
        source="inbound",
        active_event_id="evt_1",
        limit=4,
    )

    call = state["speaker_search_calls"][0]
    assert call["limit"] == 4
    assert call["filter"] == {
        "$and": [
            {
                "attribute": {"slug": "status"},
                "condition": "equals",
                "value": "Confirmed",
            },
            {
                "attribute": {"slug": "source"},
                "condition": "equals",
                "value": "in bound",
            },
            {
                "attribute": {"slug": "active_event_id"},
                "condition": "equals",
                "value": "evt_1",
            },
        ]
    }
    assert rows[0]["entry_id"] == "spk_1"
    assert rows[0]["status"] == "Prospect"


@pytest.mark.asyncio
async def test_search_speakers_rejects_unknown_source(monkeypatch: pytest.MonkeyPatch) -> None:
    state = _fresh_state()
    _install_fake_attio(monkeypatch, state)

    with pytest.raises(ValueError):
        await mcp_service.search_speakers(source="warm_intro_plus_made_up")


@pytest.mark.asyncio
async def test_get_speaker_io(monkeypatch: pytest.MonkeyPatch) -> None:
    state = _fresh_state()
    _install_fake_attio(monkeypatch, state)

    row = await mcp_service.get_speaker("spk_55")
    assert state["speaker_get_calls"] == ["spk_55"]
    assert row["entry_id"] == "spk_55"


@pytest.mark.asyncio
async def test_ensure_speaker_for_person_returns_existing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    state = _fresh_state()
    state["speaker_search_result"] = [_sample_speaker_entry("spk_existing", parent="rec_1")]
    _install_fake_attio(monkeypatch, state)

    result = await mcp_service.ensure_speaker_for_person("rec_1")

    assert not state["speaker_create_calls"]
    assert result["entry_id"] == "spk_existing"


@pytest.mark.asyncio
async def test_ensure_speaker_for_person_creates_when_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    state = _fresh_state()
    state["speaker_search_result"] = []
    state["speaker_create_result"] = _sample_speaker_entry("spk_new", parent="rec_1")
    _install_fake_attio(monkeypatch, state)

    result = await mcp_service.ensure_speaker_for_person("rec_1", source="inbound")

    assert len(state["speaker_create_calls"]) == 1
    created = state["speaker_create_calls"][0]
    assert created["parent_record"] == [{"target_record_id": "rec_1"}]
    # Source must be normalized to its canonical live Attio option title.
    assert created["source"] == [{"value": "in bound"}]
    assert result["entry_id"] == "spk_new"


@pytest.mark.asyncio
async def test_update_speaker_workflow_writes_workflow_fields(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    state = _fresh_state()
    state["speaker_update_result"] = _sample_speaker_entry("spk_wf", parent="rec_1")
    _install_fake_attio(monkeypatch, state)

    result = await mcp_service.update_speaker_workflow(
        speaker_entry_id="spk_wf",
        status="ACCEPTED",
        source="warm intro",
        active_event_id="evt_9",
        assigned="eboard_1",
        managed_poc="rec_owner",
        previous_events='["evt_prev_1"]',
    )

    assert len(state["speaker_update_calls"]) == 1
    update = state["speaker_update_calls"][0]
    assert update["entry_id"] == "spk_wf"
    values = update["values"]
    assert values["status"] == [{"value": "Confirmed"}]
    assert values["source"] == [{"value": "warm"}]
    assert values["active_event_id"] == [{"value": "evt_9"}]
    assert values["assigned"] == [{"value": "eboard_1"}]
    assert values["managed_poc"] == [{"value": "rec_owner"}]
    assert values["previous_events"] == [{"value": '["evt_prev_1"]'}]

    # Workflow writes must not accidentally touch people.
    assert not state["update_calls"]
    assert not state["create_calls"]

    assert result["entry_id"] == "spk_wf"


@pytest.mark.asyncio
async def test_update_speaker_workflow_rejects_guessed_status(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    state = _fresh_state()
    _install_fake_attio(monkeypatch, state)

    with pytest.raises(ValueError):
        await mcp_service.update_speaker_workflow(
            speaker_entry_id="spk_x",
            status="super_confirmed_plus",
        )
    assert not state["speaker_update_calls"]


@pytest.mark.asyncio
async def test_update_speaker_workflow_with_no_fields_reads_entry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    state = _fresh_state()
    state["speaker_get_result"] = _sample_speaker_entry("spk_read", parent="rec_1")
    _install_fake_attio(monkeypatch, state)

    result = await mcp_service.update_speaker_workflow(speaker_entry_id="spk_read")

    assert not state["speaker_update_calls"]
    assert state["speaker_get_calls"] == ["spk_read"]
    assert result["entry_id"] == "spk_read"


# ── Convex tools (unchanged behaviour) ───────────────────────────────────────


@pytest.mark.asyncio
async def test_list_events_io(monkeypatch: pytest.MonkeyPatch) -> None:
    state = _fresh_convex_state()
    state["list_events_result"] = [
        {"_id": "evt_1", "title": "Hack Night", "status": "draft"},
        {"_id": "evt_2", "title": "Workshop", "status": "outreach"},
    ]
    _install_fake_convex(monkeypatch, state)

    rows = await mcp_service.list_events(status="draft", limit=1)

    assert state["list_events_calls"] == [{"status": "draft", "limit": 1}]
    assert rows == [{"_id": "evt_1", "title": "Hack Night", "status": "draft"}]


@pytest.mark.asyncio
async def test_get_event_io(monkeypatch: pytest.MonkeyPatch) -> None:
    state = _fresh_convex_state()
    state["get_event_result"] = {"_id": "evt_7", "title": "Talk Night"}
    _install_fake_convex(monkeypatch, state)

    event = await mcp_service.get_event("evt_7")

    assert state["get_event_calls"] == ["evt_7"]
    assert event == {"_id": "evt_7", "title": "Talk Night"}


@pytest.mark.asyncio
async def test_get_event_outreach_io(monkeypatch: pytest.MonkeyPatch) -> None:
    state = _fresh_convex_state()
    state["outreach_result"] = [{"attio_record_id": "rec_1", "response": "pending"}]
    _install_fake_convex(monkeypatch, state)

    rows = await mcp_service.get_event_outreach("evt_7", approved=True)

    assert state["get_outreach_calls"] == [{"event_id": "evt_7", "approved": True}]
    assert rows == [{"attio_record_id": "rec_1", "response": "pending"}]


@pytest.mark.asyncio
async def test_get_event_inbound_status_io(monkeypatch: pytest.MonkeyPatch) -> None:
    state = _fresh_convex_state()
    state["inbound_status_result"] = [
        {"event_id": "evt_1", "summary": {"threads": 2}},
    ]
    _install_fake_convex(monkeypatch, state)

    rows = await mcp_service.get_event_inbound_status("evt_1")

    assert state["inbound_status_calls"] == ["evt_1"]
    assert rows == [{"event_id": "evt_1", "summary": {"threads": 2}}]


@pytest.mark.asyncio
async def test_get_attendance_dashboard_io(monkeypatch: pytest.MonkeyPatch) -> None:
    state = _fresh_convex_state()
    state["dashboard_result"] = {"totals": {"events_tracked": 2, "unique_attendees": 12}}
    _install_fake_convex(monkeypatch, state)

    dashboard = await mcp_service.get_attendance_dashboard()

    assert state["dashboard_calls"] == [True]
    assert dashboard["totals"]["events_tracked"] == 2


@pytest.mark.asyncio
async def test_get_event_attendance_io(monkeypatch: pytest.MonkeyPatch) -> None:
    state = _fresh_convex_state()
    state["attendance_result"] = {
        "event": {"_id": "evt_9", "title": "Workshop"},
        "attendees": [{"email": "ada@example.com"}],
    }
    _install_fake_convex(monkeypatch, state)

    attendance = await mcp_service.get_event_attendance("evt_9")

    assert state["attendance_calls"] == ["evt_9"]
    assert attendance["event"]["title"] == "Workshop"


@pytest.mark.asyncio
async def test_update_event_safe_io(monkeypatch: pytest.MonkeyPatch) -> None:
    state = _fresh_convex_state()
    state["update_event_result"] = {"_id": "evt_9", "title": "Updated"}
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
            "event_type": None,
            "target_profile": None,
            "needs_outreach": None,
            "speaker_confirmed": True,
            "room_confirmed": False,
        }
    ]
    assert updated == {"_id": "evt_9", "title": "Updated"}


@pytest.mark.asyncio
async def test_create_event_io(monkeypatch: pytest.MonkeyPatch) -> None:
    state = _fresh_convex_state()
    state["create_event_result"] = "evt_new_42"
    _install_fake_convex(monkeypatch, state)

    result = await mcp_service.create_event(
        title="Startup Growth Panel",
        event_date="2026-04-30",
        event_time="18:00",
        event_end_time="20:00",
        location="Room 101",
        event_type="speaker_panel",
        target_profile="early-stage founders",
        needs_outreach=True,
        status="draft",
    )

    assert len(state["create_event_safe_calls"]) == 1
    payload = state["create_event_safe_calls"][0]
    assert payload["title"] == "Startup Growth Panel"
    assert payload["event_date"] == "2026-04-30"
    assert payload["event_time"] == "18:00"
    assert payload["event_end_time"] == "20:00"
    assert payload["location"] == "Room 101"
    assert payload["event_type"] == "speaker_panel"
    assert payload["target_profile"] == "early-stage founders"
    assert payload["needs_outreach"] is True
    assert payload["status"] == "draft"

    assert result == {"event_id": "evt_new_42", "title": "Startup Growth Panel"}


@pytest.mark.asyncio
async def test_create_event_io_minimal(monkeypatch: pytest.MonkeyPatch) -> None:
    state = _fresh_convex_state()
    state["create_event_result"] = "evt_min_1"
    _install_fake_convex(monkeypatch, state)

    result = await mcp_service.create_event(
        title="Quick Meetup",
        event_date="2026-05-01",
    )

    payload = state["create_event_safe_calls"][0]
    assert payload["title"] == "Quick Meetup"
    assert payload["event_date"] == "2026-05-01"
    assert payload["status"] is None
    assert payload["needs_outreach"] is None
    assert payload["description"] is None
    assert payload["location"] is None
    assert payload["event_type"] is None

    assert result == {"event_id": "evt_min_1", "title": "Quick Meetup"}


@pytest.mark.asyncio
async def test_create_event_safe_io(monkeypatch: pytest.MonkeyPatch) -> None:
    state = _fresh_convex_state()
    state["create_event_result"] = "evt_safe_42"
    state["get_event_result"] = {
        "_id": "evt_safe_42",
        "title": "Runtime Event",
        "status": "draft",
    }
    _install_fake_convex(monkeypatch, state)

    result = await mcp_service.create_event_safe(
        title="Runtime Event",
        event_date="2026-05-15",
        needs_outreach=True,
        created_by="modal-runtime",
    )

    assert state["create_event_safe_calls"] == [
        {
            "title": "Runtime Event",
            "description": None,
            "event_date": "2026-05-15",
            "event_time": None,
            "event_end_time": None,
            "location": None,
            "event_type": None,
            "target_profile": None,
            "needs_outreach": True,
            "status": None,
            "created_by": "modal-runtime",
        }
    ]
    assert state["get_event_calls"] == ["evt_safe_42"]
    assert result == {"_id": "evt_safe_42", "title": "Runtime Event", "status": "draft"}


@pytest.mark.asyncio
async def test_update_event_safe_io_with_event_type(monkeypatch: pytest.MonkeyPatch) -> None:
    state = _fresh_convex_state()
    state["update_event_result"] = {
        "_id": "evt_10",
        "title": "Workshop",
        "event_type": "workshop",
    }
    _install_fake_convex(monkeypatch, state)

    updated = await mcp_service.update_event_safe(
        event_id="evt_10",
        event_type="workshop",
        target_profile="engineers",
    )

    call = state["update_event_calls"][0]
    assert call["event_type"] == "workshop"
    assert call["target_profile"] == "engineers"
    assert call["needs_outreach"] is None
    assert call["event_id"] == "evt_10"
    assert updated == {"_id": "evt_10", "title": "Workshop", "event_type": "workshop"}


def test_mcp_tool_docstrings_describe_event_and_attendance_uses() -> None:
    assert "newest relevant event" in (mcp_service.list_events.__doc__ or "")
    assert "actual attendance" in (mcp_service.get_event_attendance.__doc__ or "")
    assert "aggregate attendance dashboard" in (mcp_service.get_attendance_dashboard.__doc__ or "")
    assert "specific Convex event" in (mcp_service.get_event_outreach.__doc__ or "")


def test_person_and_speaker_tool_surfaces_are_separated() -> None:
    # People tools (identity-only) are present.
    for tool in ("search_people", "get_person", "upsert_person", "append_person_note"):
        assert callable(getattr(mcp_service, tool))

    # Speaker tools (workflow) are present.
    for tool in (
        "search_speakers",
        "get_speaker",
        "ensure_speaker_for_person",
        "update_speaker_workflow",
    ):
        assert callable(getattr(mcp_service, tool))

    # Compatibility read aliases are still exposed.
    assert callable(mcp_service.search_contacts)
    assert callable(mcp_service.get_contact)
    assert callable(mcp_service.create_event_safe)
