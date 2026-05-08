from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .contracts import ContextLinkRecord, MessageRecord, ThreadRecord

RECENT_MESSAGE_COUNT = 15
_LINE_TRIM = 240
_OLDER_BLOCK_CAP = 2000
_DRAFT_BODY_TRIM = 1200


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
    email_drafts: list[dict] | None = None,
) -> ThreadExecutionContext:
    """Convert normalized thread state into model-ready context."""
    finalized = sorted(
        [m for m in messages if m.status != "streaming"],
        key=lambda m: m.sequence_number,
    )

    recent_start = max(0, len(finalized) - RECENT_MESSAGE_COUNT)
    while recent_start > 0 and finalized[recent_start].role != "user":
        recent_start -= 1

    recent = finalized[recent_start:]
    older = finalized[:recent_start]

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

    drafts_section = _render_email_drafts(email_drafts or [])
    if drafts_section:
        sections.append(drafts_section)

    system_prompt = "\n\n".join(sections)
    api_messages = _to_api_messages(recent)

    return ThreadExecutionContext(system_prompt=system_prompt, messages=api_messages)


def _render_email_drafts(drafts: list[dict]) -> str | None:
    """Render the user-editable outreach drafts that are still unsent.

    Only drafts with status == 'draft' show up (sent / failed / discarded
    drafts are noise for the model). Each entry includes the current
    recipient, subject, and body — these may have been edited by the user
    in the timeline card since the model last drafted, so the model must
    treat what it sees here as the latest state, not its own prior output.
    """
    active = [d for d in drafts if (d or {}).get("status") == "draft"]
    if not active:
        return None

    lines = [
        "## Pending email drafts",
        (
            "The user has these outreach emails drafted but not yet sent. They "
            "can edit any field inline before sending. The body shown here is "
            "the user's latest version — the user may have refined what you "
            "originally drafted. If asked to refine a draft, call "
            "`send_outreach_email` again with the updated content; the new "
            "draft will appear in the timeline and the user can discard the "
            "old one."
        ),
        "",
    ]
    for d in active:
        to_name = (d.get("to_name") or "").strip()
        to_email = (d.get("to_email") or "").strip()
        recipient = (
            f"{to_name} <{to_email}>" if to_name and to_email else (to_email or "<no recipient>")
        )
        subject = (d.get("subject") or "").strip() or "<no subject>"
        body = (d.get("body") or "").strip()
        if len(body) > _DRAFT_BODY_TRIM:
            body = body[:_DRAFT_BODY_TRIM] + "…"
        external_id = d.get("external_id") or "<unknown>"
        lines.append(f"- {external_id} | to: {recipient} | subject: {subject}")
        if body:
            indented = "\n".join(f"    {ln}" for ln in body.splitlines())
            lines.append("  body:")
            lines.append(indented)
    return "\n".join(lines)


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
