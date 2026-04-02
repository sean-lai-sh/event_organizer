import helper.attio
import helper.tools
from core.clients.attio import AttioClient as CoreAttioClient, flatten_record as core_flatten_record
from core.clients.convex import ConvexClient as CoreConvexClient


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
