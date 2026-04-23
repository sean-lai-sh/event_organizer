from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .contracts import ContextLinkRecord, MessageRecord, ThreadRecord

_RECENT_MESSAGE_COUNT = 15
_LINE_TRIM = 240
_OLDER_BLOCK_CAP = 2000


@dataclass(slots=True)
class ThreadExecutionContext:
    system_prompt: str
    messages: list[dict[str, Any]] = field(default_factory=list)


def assemble_thread_context(
    *,
    thread: ThreadRecord,
    messages: list[MessageRecord],
    context_links: list[ContextLinkRecord],
    base_system_prompt: str,
) -> ThreadExecutionContext:
    """Convert normalized thread state into model-ready context."""
    finalized = sorted(
        [m for m in messages if m.status != "streaming"],
        key=lambda m: m.sequence_number,
    )

    recent = finalized[-_RECENT_MESSAGE_COUNT:]
    older = finalized[: max(0, len(finalized) - _RECENT_MESSAGE_COUNT)]

    sections: list[str] = [base_system_prompt]

    metadata_lines: list[str] = []
    if thread.title:
        metadata_lines.append(f"Thread title: {thread.title}")
    if thread.summary:
        metadata_lines.append(f"Thread summary: {thread.summary}")
    if metadata_lines:
        sections.append("## Thread\n" + "\n".join(metadata_lines))

    if context_links:
        link_lines = [
            "- [{entity_type}] {entity_id}{label}".format(
                entity_type=link.entity_type,
                entity_id=link.entity_id,
                label=f" ({link.label})" if link.label else "",
            )
            for link in context_links
        ]
        sections.append("## Context Links\n" + "\n".join(link_lines))

    if older:
        compressed = _compress_older_messages(older)
        if compressed:
            sections.append(f"## Older thread context\n{compressed}")

    system_prompt = "\n\n".join(sections)
    api_messages = _to_api_messages(recent)

    return ThreadExecutionContext(system_prompt=system_prompt, messages=api_messages)


def _compress_older_messages(messages: list[MessageRecord]) -> str:
    lines: list[str] = []
    total = 0
    for msg in messages:
        text = (msg.plain_text or "").strip()
        if not text:
            continue
        for line in text.splitlines():
            trimmed = line[:_LINE_TRIM]
            entry = f"[{msg.role}] {trimmed}"
            if total + len(entry) + 1 > _OLDER_BLOCK_CAP:
                return "\n".join(lines)
            lines.append(entry)
            total += len(entry) + 1
    return "\n".join(lines)


def _to_api_messages(messages: list[MessageRecord]) -> list[dict[str, Any]]:
    """Convert MessageRecord list to Anthropic API messages format.

    Tool messages are mapped to user role. Consecutive same-role messages are
    merged so the list satisfies Anthropic's alternating-role requirement.
    """
    raw: list[dict[str, Any]] = []
    for msg in messages:
        role = "user" if msg.role == "tool" else msg.role
        if role not in ("user", "assistant"):
            continue
        text = (msg.plain_text or "").strip()
        if not text:
            continue
        raw.append({"role": role, "content": text})

    if not raw:
        return []

    merged: list[dict[str, Any]] = [raw[0]]
    for item in raw[1:]:
        if item["role"] == merged[-1]["role"]:
            merged[-1] = {
                "role": item["role"],
                "content": merged[-1]["content"] + "\n\n" + item["content"],
            }
        else:
            merged.append(item)

    # Anthropic requires messages to start with "user"
    while merged and merged[0]["role"] != "user":
        merged.pop(0)

    return merged
