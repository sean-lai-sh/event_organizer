from __future__ import annotations

from typing import Any, Awaitable, Callable
from uuid import uuid4

from .contracts import EmailDraftRecord
from .run_context import get_run_context

try:
    from apps.mcp.service import (
        append_person_note,
        book_oncehub_room,
        create_event,
        ensure_speaker_for_person,
        find_oncehub_slots,
        get_attendance_dashboard,
        get_contact,
        get_event,
        get_event_attendance,
        get_event_inbound_status,
        get_event_outreach,
        get_event_room_booking,
        get_person,
        get_speaker,
        list_events,
        search_contacts,
        search_people,
        search_speakers,
        update_event_safe,
        update_speaker_workflow,
        upsert_person,
    )
except ModuleNotFoundError:  # pragma: no cover - package import fallback
    from agent.apps.mcp.service import (  # type: ignore
        append_person_note,
        book_oncehub_room,
        create_event,
        ensure_speaker_for_person,
        find_oncehub_slots,
        get_attendance_dashboard,
        get_contact,
        get_event,
        get_event_attendance,
        get_event_inbound_status,
        get_event_outreach,
        get_event_room_booking,
        get_person,
        get_speaker,
        list_events,
        search_contacts,
        search_people,
        search_speakers,
        update_event_safe,
        update_speaker_workflow,
        upsert_person,
    )


async def _draft_outreach_email(
    *,
    recipient_name: str,
    recipient_email: str,
    subject: str,
    message_body: str,
    sender_name: str = "",
    sender_email: str = "",
    signature: str = "",
) -> dict[str, Any]:
    """In-conversation outreach: persist a draft, return immediately.

    The draft is rendered as an editable card in the timeline; the user
    sends it via the Next.js /api/agent/email/send route. The agent
    runtime never invokes AgentMail itself — that prevents the run
    from blocking on user review.
    """
    ctx = get_run_context()
    if ctx is None:
        return {
            "draft_id": None,
            "status": "draft_not_persisted",
            "message": (
                "Email draft could not be persisted because no run context is "
                "active. The user did not see this draft."
            ),
        }

    external_id = f"draft_{uuid4().hex}"
    record = EmailDraftRecord(
        external_id=external_id,
        thread_external_id=ctx.thread_external_id,
        run_external_id=ctx.run_external_id,
        to_name=recipient_name,
        to_email=recipient_email,
        subject=subject,
        body=message_body,
        from_name=sender_name or None,
        from_email=sender_email or None,
        signature=signature or None,
    )

    persisted_id = await ctx.sync.upsert_email_draft(record)
    if persisted_id is None:
        return {
            "draft_id": external_id,
            "status": "draft_not_persisted",
            "message": (
                "Email draft could not be persisted (storage unavailable). "
                "Tell the user the draft was prepared but not shown — they "
                "will need to retry."
            ),
        }

    return {
        "draft_id": external_id,
        "status": "draft_pending_user_review",
        "message": (
            "Email draft created and shown to the user as an editable card. "
            "Do NOT say the email was sent — the user will review and send it."
        ),
    }

ToolHandler = Callable[..., Awaitable[Any]]

TOOL_HANDLERS: dict[str, ToolHandler] = {
    # people tools (identity only)
    "search_people": search_people,
    "get_person": get_person,
    "upsert_person": upsert_person,
    "append_person_note": append_person_note,
    # compatibility aliases
    "search_contacts": search_contacts,
    "get_contact": get_contact,
    # speaker tools (workflow)
    "search_speakers": search_speakers,
    "get_speaker": get_speaker,
    "ensure_speaker_for_person": ensure_speaker_for_person,
    "update_speaker_workflow": update_speaker_workflow,
    # convex reads + writes
    "list_events": list_events,
    "get_event": get_event,
    "get_event_inbound_status": get_event_inbound_status,
    "get_event_outreach": get_event_outreach,
    "get_attendance_dashboard": get_attendance_dashboard,
    "get_event_attendance": get_event_attendance,
    "create_event": create_event,
    "update_event_safe": update_event_safe,
    "find_oncehub_slots": find_oncehub_slots,
    "book_oncehub_room": book_oncehub_room,
    "get_event_room_booking": get_event_room_booking,
    # outreach email — in-conversation tool drafts an email card; the FE
    # sends it via /api/agent/email/send. See _draft_outreach_email above.
    "send_outreach_email": _draft_outreach_email,
}


async def execute_tool_call(tool_name: str, tool_input: dict[str, Any]) -> Any:
    handler = TOOL_HANDLERS.get(tool_name)
    if handler is None:
        raise ValueError(f"Unsupported MCP tool: {tool_name}")
    return await handler(**tool_input)
