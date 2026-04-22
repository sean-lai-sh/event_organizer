import json

from runtime.normalize import (
    as_sse,
    extract_action_items,
    make_checklist_artifact,
    make_report_artifact,
    summarize_text_for_run,
    summarize_text_for_thread,
    text_block,
)
from runtime.contracts import StreamEvent


def test_make_report_artifact_serializes_metadata() -> None:
    artifact = make_report_artifact(
        external_id="artifact_1",
        thread_id="thread_1",
        run_id="run_1",
        title="Summary",
        summary="run output",
        report_text="hello world",
        sort_order=1,
    )

    assert artifact.kind.value == "report"
    assert artifact.content_blocks[0].text == "hello world"

    metadata = json.loads(artifact.content_blocks[1].data_json or "{}")
    assert metadata["source"] == "modal_runtime"


def test_make_checklist_artifact_serializes_items() -> None:
    artifact = make_checklist_artifact(
        external_id="artifact_2",
        thread_id="thread_1",
        run_id="run_1",
        title="Next Steps",
        summary="2 action items",
        items=[
            {"id": "todo_1", "label": "Send the draft", "checked": False},
            {"id": "todo_2", "label": "Confirm availability", "checked": False},
        ],
        sort_order=2,
    )

    assert artifact.kind.value == "checklist"
    payload = json.loads(artifact.content_blocks[0].data_json or "{}")
    assert payload["items"][0]["label"] == "Send the draft"
    assert artifact.content_blocks[1].text == "- Send the draft\n- Confirm availability"


def test_as_sse_never_emits_raw_provider_payload() -> None:
    event = StreamEvent(
        run_id="run_1",
        sequence=1,
        event="assistant.delta",
        created_at=100,
        data={"text": "partial"},
    )

    payload = as_sse(event)
    assert payload.startswith("event: assistant.delta")
    assert "provider_event" not in payload


def test_text_block_is_normalized() -> None:
    block = text_block("hi", label="greeting")
    assert block.kind == "text"
    assert block.text == "hi"
    assert block.label == "greeting"


def test_summary_helpers_strip_markdown_and_code_fences() -> None:
    text = """
## Attendance Update

The latest event had 42 attendees.

```json
{"attendees": 42}
```
"""

    assert summarize_text_for_run(text) == "Attendance Update"
    assert summarize_text_for_thread(text) == "Attendance Update"


def test_summary_helpers_use_first_sentence_without_heading() -> None:
    text = "The room is confirmed. Speaker confirmation is still pending."

    assert summarize_text_for_run(text) == "The room is confirmed."
    assert summarize_text_for_thread(text) == "The room is confirmed."


def test_extract_action_items_prefers_explicit_action_sections() -> None:
    text = """
## Outreach status

Draft is ready for review.

### Next steps
1. Send the draft to Alex for approval.
2. Confirm the speaker availability window.
"""

    assert extract_action_items(text) == [
        {
            "id": "todo_1",
            "label": "Send the draft to Alex for approval.",
            "checked": False,
        },
        {
            "id": "todo_2",
            "label": "Confirm the speaker availability window.",
            "checked": False,
        },
    ]


def test_extract_action_items_accepts_top_level_imperative_bullets() -> None:
    text = """
- Send the updated draft to Alex.
- Confirm the backup room booking.
"""

    assert extract_action_items(text) == [
        {
            "id": "todo_1",
            "label": "Send the updated draft to Alex.",
            "checked": False,
        },
        {
            "id": "todo_2",
            "label": "Confirm the backup room booking.",
            "checked": False,
        },
    ]


def test_extract_action_items_ignores_descriptive_lists() -> None:
    text = """
## Attendance overview

- Attendance rose from 35 to 42.
- Retention improved for first-time guests.
"""

    assert extract_action_items(text) == []
