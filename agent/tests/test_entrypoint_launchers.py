from apps.match.app import app as match_app, match_contacts_for_event
from apps.outreach.app import app as outreach_app, send_outreach_for_event
from apps.replies.app import app as replies_app, handle_reply as replies_handle_reply
from apps.runtime.app import app as runtime_modal_app, fastapi_app as runtime_fastapi_app

import match
import mcp_server
import outreach
import reply_handler
import runtime.modal_app
import runtime_app


def test_root_match_launcher_targets_apps_module() -> None:
    assert match.app is match_app
    assert match.match_contacts_for_event is match_contacts_for_event


def test_root_outreach_launcher_targets_apps_module() -> None:
    assert outreach.app is outreach_app
    assert outreach.send_outreach_for_event is send_outreach_for_event


def test_root_reply_launcher_targets_apps_module() -> None:
    assert reply_handler.app is replies_app
    assert reply_handler.handle_reply is replies_handle_reply


def test_runtime_shims_target_runtime_launcher() -> None:
    assert runtime_app.app is runtime_modal_app
    assert runtime_app.fastapi_app is runtime_fastapi_app
    assert runtime.modal_app.app is runtime_app.app
    assert runtime.modal_app.fastapi_app is runtime_app.fastapi_app


def test_mcp_root_launcher_exposes_server_contract() -> None:
    assert hasattr(mcp_server, "mcp")
    assert callable(mcp_server.search_contacts)
    assert callable(mcp_server.get_contact)
    assert callable(mcp_server.create_contact)
    assert callable(mcp_server.update_contact)
