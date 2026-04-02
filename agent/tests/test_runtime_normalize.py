import json

from runtime.normalize import as_sse, make_report_artifact, text_block
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
