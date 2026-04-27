import helper.attio
import helper.tools
import pytest
from core.clients.attio import AttioClient as CoreAttioClient, flatten_record as core_flatten_record
from core.clients.convex import ConvexClient as CoreConvexClient


class FakeAttioClient:
    def __init__(self, state: dict) -> None:
        self.state = state

    async def __aenter__(self) -> "FakeAttioClient":
        return self

    async def __aexit__(self, *_args) -> None:
        return None

    async def search_contacts(self, filter_: dict, limit: int = 100, offset: int = 0) -> list[dict]:
        self.state["search_contacts"].append({"filter": filter_, "limit": limit, "offset": offset})
        return self.state.get("contacts", [])

    async def create_contact(self, values: dict) -> dict:
        self.state["create_contact"].append(values)
        return {
            "id": {"record_id": "rec_created"},
            "values": values,
        }

    async def create_note(self, record_id: str, title: str, content: str) -> dict:
        self.state["create_note"].append(
            {"record_id": record_id, "title": title, "content": content}
        )
        return {"id": {"note_id": "note_1"}}

    async def update_contact(self, record_id: str, values: dict) -> dict:
        self.state["update_contact"].append({"record_id": record_id, "values": values})
        return {"id": {"record_id": record_id}, "values": values}

    async def search_speaker_entries(
        self, filter_: dict, limit: int = 100, offset: int = 0
    ) -> list[dict]:
        self.state["search_speaker_entries"].append(
            {"filter": filter_, "limit": limit, "offset": offset}
        )
        return self.state.get("speakers", [])

    async def create_speaker_entry(self, values: dict) -> dict:
        self.state["create_speaker_entry"].append(values)
        return {
            "id": {"entry_id": "spk_created"},
            "values": values,
        }


def _state() -> dict:
    return {
        "search_contacts": [],
        "create_contact": [],
        "update_contact": [],
        "create_note": [],
        "search_speaker_entries": [],
        "create_speaker_entry": [],
    }


def test_helper_attio_reexports_core_clients() -> None:
    assert helper.attio.AttioClient is CoreAttioClient
    assert helper.attio.flatten_record is core_flatten_record


def test_helper_tools_reexports_core_clients() -> None:
    assert helper.tools.ConvexClient is CoreConvexClient
    assert helper.tools.get_agentmail_client.__module__ in {"helper.tools", "agent.helper.tools"}


def test_helper_tools_compat_functions_present() -> None:
    assert callable(helper.tools.llm_call)
    assert callable(helper.tools.fetch_enriched_contacts)
    assert callable(helper.tools.append_attio_note)
    assert callable(helper.tools.upsert_inbound_contact)


@pytest.mark.asyncio
async def test_append_attio_note_does_not_write_people_workflow(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    state = _state()
    monkeypatch.setattr(helper.tools, "AttioClient", lambda: FakeAttioClient(state))

    await helper.tools.append_attio_note(
        "rec_1",
        "Invited to event",
        outreach_status="agent_active",
    )

    assert len(state["create_note"]) == 1
    assert state["update_contact"] == []


@pytest.mark.asyncio
async def test_upsert_inbound_contact_creates_identity_only_person_and_speaker(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    state = _state()
    state["contacts"] = []
    state["speakers"] = []
    monkeypatch.setattr(helper.tools, "AttioClient", lambda: FakeAttioClient(state))

    result = await helper.tools.upsert_inbound_contact(
        "ADA@EXAMPLE.COM",
        sender_name="Ada Lovelace",
    )

    assert result["id"] == "rec_created"
    values = state["create_contact"][0]
    assert values["name"] == [{"first_name": "Ada", "last_name": "Lovelace"}]
    assert values["email_addresses"] == [{"email_address": "ada@example.com"}]
    assert "contact_source" not in values
    assert "outreach_status" not in values
    assert "relationship_stage" not in values
    assert state["create_speaker_entry"][0] == {
        "parent_record": [{"target_record_id": "rec_created"}],
        "source": [{"value": "in bound"}],
        "status": [{"value": "Prospect"}],
    }
