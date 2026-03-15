"""
Phase 4: Reply Handler — process inbound emails via AgentMail webhook.

Entry point: `handle_reply` (Modal web endpoint, POST).

Two paths:
  Known thread  — thread_id matches an existing outreach row → classify reply,
                  update Convex workflow state + milestones, append Attio note.
  Net-new       — no matching thread → upsert Attio contact, classify, and
                  auto-create a draft event only when both event_signal and
                  timing_signal are true.

To seed test data locally: agent/seed_dev.py
"""
from __future__ import annotations

from email.utils import parseaddr

import modal

from helper.email_parse import (
    extract_email_list,
    extract_first_email,
    handle_known_thread,
    handle_net_new,
)
from helper.tools import ConvexClient

app = modal.App("event-outreach-replies")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("httpx>=0.27", "anthropic>=0.40", "agentmail", "python-dotenv", "pydantic>=2.0", "fastapi[standard]")
    .add_local_python_source("helper")
    .add_local_dir("helper/prompts", "/root/helper/prompts")
)


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("doppler-v1")],
    timeout=90,
)
@modal.concurrent(max_inputs=10)
@modal.fastapi_endpoint(method="POST")
async def handle_reply(payload: dict) -> dict:
    """AgentMail webhook endpoint for message.received events."""
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

    async with ConvexClient() as sb:
        if message_id:
            is_duplicate = await sb.record_inbound_receipt(str(message_id), thread_id=thread_id)
            if is_duplicate:
                return {"status": "ignored", "reason": f"Duplicate message_id {message_id}"}
        outreach = await sb.find_outreach_by_thread(thread_id) if thread_id else None

    if outreach:
        return await handle_known_thread(
            outreach=outreach, sender_email=sender_email, body=body,
            to_emails=to_emails, cc_emails=cc_emails, thread_id=thread_id,
        )

    return await handle_net_new(
        sender_email=sender_email, sender_name=sender_name, subject=subject, body=body,
        to_emails=to_emails, cc_emails=cc_emails, thread_id=thread_id,
    )
