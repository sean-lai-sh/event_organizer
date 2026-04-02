"""
Phase 4: Reply Handler — process inbound emails via AgentMail webhook.
"""
from __future__ import annotations

from email.utils import parseaddr

import modal

try:
    from core.modal.config import build_image, secret
    from helper.email_parse import (
        extract_email_list,
        extract_first_email,
        handle_known_thread,
        handle_net_new,
    )
    from helper.tools import ConvexClient
except ModuleNotFoundError:  # pragma: no cover - package import fallback
    from agent.core.modal.config import build_image, secret
    from agent.helper.email_parse import (
        extract_email_list,
        extract_first_email,
        handle_known_thread,
        handle_net_new,
    )
    from agent.helper.tools import ConvexClient

app = modal.App("event-outreach-replies")

image = build_image(extra_pip=["agentmail"], add_prompts=True)


@app.function(
    image=image,
    secrets=[secret("replies")],
    timeout=90,
)
@modal.concurrent(max_inputs=10)
@modal.fastapi_endpoint(method="POST")
async def handle_reply(payload: dict) -> dict:
    event_type = payload.get("event_type")
    if event_type != "message.received":
        return {"status": "ignored", "reason": f"Unhandled event type: {event_type}"}

    message = payload.get("message", {})
    thread_id = message.get("thread_id")
    message_id = message.get("message_id") or message.get("id")
    sender_raw = message.get("from_") or message.get("from")
    sender_email = extract_first_email(sender_raw)
    sender_name, _ = parseaddr(sender_raw if isinstance(sender_raw, str) else "")
    subject = str(message.get("subject", "") or "")
    body = str(message.get("text", "") or "")
    to_emails = extract_email_list(message.get("to"))
    cc_emails = extract_email_list(message.get("cc"))

    if not sender_email:
        return {"status": "ignored", "reason": "No sender email"}

    receipt_claimed = False
    async with ConvexClient() as sb:
        if message_id:
            receipt_state = await sb.begin_inbound_receipt(str(message_id), thread_id=thread_id)
            if receipt_state.get("is_duplicate"):
                return {"status": "ignored", "reason": f"Duplicate message_id {message_id}"}
            if receipt_state.get("in_progress"):
                return {"status": "ignored", "reason": f"Message_id {message_id} is already processing"}
            receipt_claimed = bool(receipt_state.get("should_process"))
        outreach = await sb.find_outreach_by_thread(thread_id) if thread_id else None

    try:
        if outreach:
            result = await handle_known_thread(
                outreach=outreach,
                sender_email=sender_email,
                body=body,
                to_emails=to_emails,
                cc_emails=cc_emails,
                thread_id=thread_id,
            )
        else:
            result = await handle_net_new(
                sender_email=sender_email,
                sender_name=sender_name,
                subject=subject,
                body=body,
                to_emails=to_emails,
                cc_emails=cc_emails,
                thread_id=thread_id,
            )
    except Exception:
        if message_id and receipt_claimed:
            async with ConvexClient() as sb:
                await sb.release_inbound_receipt(str(message_id))
        raise

    if message_id and receipt_claimed:
        async with ConvexClient() as sb:
            await sb.complete_inbound_receipt(str(message_id), thread_id=thread_id)

    return result


__all__ = ["app", "image", "handle_reply"]
