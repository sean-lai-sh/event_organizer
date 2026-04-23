from __future__ import annotations

import json
import re
from typing import Iterable, NotRequired, TypedDict

from .contracts import ArtifactKind, ArtifactRecord, ContentBlock, StreamEvent, TraceStepKind, TraceStepRecord

_CODE_FENCE_RE = re.compile(r"```.*?```", re.DOTALL)
_HEADING_RE = re.compile(r"^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$")
_LIST_ITEM_RE = re.compile(r"^\s{0,3}(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+\.\s+)(.*)$")
_LINK_RE = re.compile(r"\[([^\]]+)\]\([^)]+\)")
_HTML_TAG_RE = re.compile(r"<[^>]+>")
_WHITESPACE_RE = re.compile(r"\s+")
_ACTION_HEADINGS = {
    "action item",
    "action items",
    "follow up",
    "follow-up",
    "next step",
    "next steps",
    "to do",
    "todo",
}
_ACTION_VERBS = {
    "add",
    "align",
    "approve",
    "ask",
    "attach",
    "book",
    "call",
    "check",
    "collect",
    "confirm",
    "contact",
    "coordinate",
    "create",
    "decide",
    "document",
    "draft",
    "email",
    "finalize",
    "follow",
    "gather",
    "notify",
    "prepare",
    "publish",
    "queue",
    "reach",
    "remove",
    "resend",
    "review",
    "schedule",
    "send",
    "set",
    "setup",
    "share",
    "ship",
    "summarize",
    "sync",
    "track",
    "update",
    "verify",
    "write",
}


class ChecklistItemPayload(TypedDict):
    id: str
    label: str
    checked: bool
    notes: NotRequired[str]


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


def summarize_text_for_run(text: str) -> str:
    return _summarize_text(text, max_chars=160)


def summarize_text_for_thread(text: str) -> str:
    return _summarize_text(text, max_chars=140)


def extract_action_items(text: str) -> list[ChecklistItemPayload]:
    items: list[ChecklistItemPayload] = []
    seen_labels: set[str] = set()
    in_action_section = False

    for raw_line in _strip_code_fences(text).splitlines():
        heading = _extract_heading(raw_line)
        if heading is not None:
            in_action_section = _is_action_heading(heading)
            continue

        list_text = _extract_list_item(raw_line)
        if not list_text:
            continue

        cleaned = _clean_line(list_text)
        if not cleaned:
            continue
        if not in_action_section and not _looks_actionable(cleaned):
            continue

        normalized = cleaned.casefold()
        if normalized in seen_labels:
            continue
        seen_labels.add(normalized)

        items.append(
            ChecklistItemPayload(
                id=f"todo_{len(items) + 1}",
                label=_truncate(cleaned, max_chars=120),
                checked=False,
            )
        )

    return items


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

def make_trace_step(
    *,
    external_id: str,
    thread_id: str,
    run_id: str,
    kind: TraceStepKind,
    sequence_number: int,
    summary: str,
    detail_json: str | None = None,
    status: str = "completed",
) -> TraceStepRecord:
    created_at = now_ms()
    return TraceStepRecord(
        external_id=external_id,
        thread_external_id=thread_id,
        run_external_id=run_id,
        kind=kind,
        sequence_number=sequence_number,
        summary=summary,
        detail_json=detail_json,
        status=status,
        created_at=created_at,
        updated_at=created_at,
    )


def make_checklist_artifact(
    *,
    external_id: str,
    thread_id: str,
    run_id: str,
    title: str,
    summary: str,
    items: list[ChecklistItemPayload],
    sort_order: int,
) -> ArtifactRecord:
    created_at = now_ms()
    body = "\n".join(f"- {item['label']}" for item in items)
    return ArtifactRecord(
        external_id=external_id,
        thread_external_id=thread_id,
        run_external_id=run_id,
        kind=ArtifactKind.CHECKLIST,
        status="ready",
        sort_order=sort_order,
        title=title,
        summary=summary,
        content_blocks=[
            json_block("checklist_data", {"items": items}, label="items"),
            text_block(body, label="body"),
        ],
        created_at=created_at,
        updated_at=created_at,
    )


def as_sse(event: StreamEvent) -> str:
    payload = event.model_dump_json()
    return f"event: {event.event}\ndata: {payload}\n\n"


def _summarize_text(text: str, *, max_chars: int) -> str:
    for candidate in _summary_candidates(text):
        sentence = _first_sentence(candidate)
        if sentence:
            return _truncate(sentence, max_chars=max_chars)
    return "Completed response"


def _summary_candidates(text: str) -> list[str]:
    candidates: list[str] = []
    for raw_line in _strip_code_fences(text).splitlines():
        cleaned = _clean_line(raw_line)
        if not cleaned:
            continue
        if cleaned.casefold() in _ACTION_HEADINGS:
            continue
        candidates.append(cleaned)
    return candidates


def _first_sentence(text: str) -> str:
    parts = re.split(r"(?<=[.!?])\s+", text, maxsplit=1)
    if not parts:
        return ""
    sentence = parts[0].strip()
    if len(parts) == 1:
        return sentence
    if len(sentence) >= 12 or len(sentence.split()) >= 3:
        return sentence
    return text.strip()


def _strip_code_fences(text: str) -> str:
    return _CODE_FENCE_RE.sub(" ", text)


def _extract_heading(line: str) -> str | None:
    match = _HEADING_RE.match(line)
    if not match:
        return None
    cleaned = _clean_line(match.group(1))
    return cleaned or None


def _extract_list_item(line: str) -> str | None:
    match = _LIST_ITEM_RE.match(line)
    if not match:
        return None
    return match.group(1).strip() or None


def _clean_line(text: str) -> str:
    value = text.strip()
    if not value:
        return ""
    if value.startswith("|") and value.endswith("|"):
        return ""

    value = _LINK_RE.sub(r"\1", value)
    value = value.replace("`", "")
    value = _HTML_TAG_RE.sub(" ", value)
    value = re.sub(r"^\s{0,3}#{1,6}\s+", "", value)
    value = re.sub(r"^\s{0,3}>\s?", "", value)
    value = re.sub(r"^\s{0,3}(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+\.\s+)", "", value)
    value = value.replace("**", "").replace("__", "").replace("*", "").replace("_", "")
    value = value.replace("~~", "")
    value = _WHITESPACE_RE.sub(" ", value)
    return value.strip(" -:\t")


def _is_action_heading(heading: str) -> bool:
    return heading.casefold() in _ACTION_HEADINGS


def _looks_actionable(text: str) -> bool:
    lowered = text.casefold()
    if lowered.endswith("?"):
        return False
    if lowered.startswith(("please ", "let's ", "lets ")):
        return True

    words = lowered.split()
    if not words:
        return False

    first = words[0].strip(" :;,.-")
    return first in _ACTION_VERBS


def _truncate(text: str, *, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text

    candidate = text[: max_chars + 1].rsplit(" ", 1)[0].rstrip(" ,.;:")
    if not candidate:
        candidate = text[:max_chars].rstrip(" ,.;:")
    return f"{candidate}..."
