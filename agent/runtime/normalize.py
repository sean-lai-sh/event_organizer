from __future__ import annotations

import json
from typing import Iterable

from .contracts import ArtifactKind, ArtifactRecord, ContentBlock, StreamEvent


def now_ms() -> int:
    from time import time

    return int(time() * 1000)


def text_block(text: str, *, label: str | None = None) -> ContentBlock:
    return ContentBlock(kind="text", label=label, text=text)


def json_block(kind: str, payload: dict, *, label: str | None = None) -> ContentBlock:
    return ContentBlock(kind=kind, label=label, mime_type="application/json", data_json=json.dumps(payload))


def plain_text_from_blocks(blocks: Iterable[ContentBlock]) -> str:
    parts = [block.text for block in blocks if block.text]
    return "\n".join(parts).strip()


def make_report_artifact(
    *,
    external_id: str,
    thread_id: str,
    run_id: str,
    title: str,
    summary: str,
    report_text: str,
    sort_order: int,
) -> ArtifactRecord:
    created_at = now_ms()
    return ArtifactRecord(
        external_id=external_id,
        thread_external_id=thread_id,
        run_external_id=run_id,
        kind=ArtifactKind.REPORT,
        status="ready",
        sort_order=sort_order,
        title=title,
        summary=summary,
        content_blocks=[
            text_block(report_text, label="body"),
            json_block("report_meta", {"source": "modal_runtime"}, label="meta"),
        ],
        created_at=created_at,
        updated_at=created_at,
    )


def as_sse(event: StreamEvent) -> str:
    payload = event.model_dump_json()
    return f"event: {event.event}\ndata: {payload}\n\n"
