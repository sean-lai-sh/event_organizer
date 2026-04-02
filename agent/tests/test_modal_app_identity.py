from apps.match.app import app as match_app
from apps.outreach.app import app as outreach_app
from apps.replies.app import app as replies_app
from apps.runtime.app import app as runtime_app


def test_modal_app_names_are_stable() -> None:
    assert match_app.name == "event-outreach-match"
    assert outreach_app.name == "event-outreach-send"
    assert replies_app.name == "event-outreach-replies"
    assert runtime_app.name == "event-agent-runtime"
