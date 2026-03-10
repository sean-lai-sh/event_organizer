"""
Phase 4: Reply Handler — process incoming replies via AgentMail webhook.

Trigger: AgentMail webhook `message.received`
Compute: Modal web endpoint
"""
from __future__ import annotations

import json

import modal

from .tools import (
    ConvexClient,
    append_attio_note,
    get_agentmail_client,
    llm_call,
)

app = modal.App("event-outreach-replies")

image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "httpx>=0.27", "anthropic>=0.40", "agentmail", "python-dotenv", "pydantic>=2.0",
)

CLASSIFY_SYSTEM_PROMPT = """\
You are classifying a reply to an event invitation email sent by a student club.

Given the conversation thread and the latest reply, classify the response as one of:
- ACCEPTED — the contact confirmed they will attend
- DECLINED — the contact declined the invitation
- QUESTION — the contact is asking for more information about the event
- NEEDS_HUMAN — the reply is ambiguous, off-topic, or requires human judgment

Return valid JSON with these fields:
- classification: one of ACCEPTED, DECLINED, QUESTION, NEEDS_HUMAN
- reasoning: string (1 sentence)
- suggested_reply: string or null (draft reply if classification is QUESTION)"""


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("event-outreach-secrets")],
    timeout=60,
    allow_concurrent_inputs=10,
)
@modal.web_endpoint(method="POST")
async def handle_reply(payload: dict) -> dict:
    """
    AgentMail webhook endpoint for message.received events.

    Payload shape:
        { event_type: "message.received", message: { from_, thread_id, text, ... } }
    """
    event_type = payload.get("event_type")
    if event_type != "message.received":
        return {"status": "ignored", "reason": f"Unhandled event type: {event_type}"}

    message = payload.get("message", {})
    thread_id = message.get("thread_id")
    sender_email = message.get("from_") or message.get("from")
    body = message.get("text", "")
    message_id = message.get("message_id")

    if not thread_id:
        return {"status": "ignored", "reason": "No thread_id"}

    # 1. Look up outreach record by thread
    async with ConvexClient() as sb:
        outreach = await sb.find_outreach_by_thread(thread_id)
    if not outreach:
        return {"status": "ignored", "reason": f"No outreach for thread {thread_id}"}

    event_id = outreach["event_id"]
    record_id = outreach["attio_record_id"]

    # 2. Get thread history for LLM context
    agentmail = get_agentmail_client()
    thread = agentmail.threads.get(thread_id)
    thread_messages = [
        {"from": getattr(m, "from_", ""), "text": getattr(m, "text", "")}
        for m in getattr(thread, "messages", [])
    ]

    # 3. Get event details for context
    async with ConvexClient() as sb:
        event = await sb.get_event(event_id)
    event_context = json.dumps({
        "title": event.get("title") if event else "Unknown",
        "event_date": str(event.get("event_date", "")) if event else "",
        "location": event.get("location") if event else "",
        "description": event.get("description") if event else "",
    })

    # 4. LLM classifies the reply
    user_prompt = (
        f"## Event\n{event_context}\n\n"
        f"## Thread history\n{json.dumps(thread_messages, indent=2)}\n\n"
        f"## Latest reply\nFrom: {sender_email}\n{body}"
    )
    raw = await llm_call(CLASSIFY_SYSTEM_PROMPT, user_prompt, max_tokens=512)

    try:
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0]
        decision = json.loads(cleaned)
    except json.JSONDecodeError:
        decision = {"classification": "NEEDS_HUMAN", "reasoning": "Failed to parse LLM response"}

    classification = decision.get("classification", "NEEDS_HUMAN")
    inbox_id = getattr(thread, "inbox_id", None)

    # 5. Act on classification
    if classification == "ACCEPTED":
        async with ConvexClient() as sb:
            await sb.update_outreach(event_id, record_id, {"response": "accepted"})
        await append_attio_note(record_id, f"ACCEPTED invitation to event {event_id}")

    elif classification == "DECLINED":
        async with ConvexClient() as sb:
            await sb.update_outreach(event_id, record_id, {"response": "declined"})
        await append_attio_note(record_id, f"DECLINED invitation to event {event_id}")

    elif classification == "QUESTION":
        suggested_reply = decision.get("suggested_reply")
        if suggested_reply and inbox_id and message_id:
            agentmail.inboxes.messages.reply(
                inbox_id=inbox_id,
                message_id=message_id,
                to=[sender_email],
                text=suggested_reply,
            )
            await append_attio_note(record_id, f"Auto-replied to question about event {event_id}")

    elif classification == "NEEDS_HUMAN":
        if inbox_id and message_id and event:
            created_by = event.get("created_by")
            if created_by:
                agentmail.inboxes.messages.forward(
                    inbox_id=inbox_id,
                    message_id=message_id,
                    to=[created_by],
                    text=f"This reply needs your attention. Classification: {decision.get('reasoning', 'N/A')}",
                )
        await append_attio_note(
            record_id,
            f"Reply escalated to human for event {event_id}: {decision.get('reasoning', '')}",
        )

    return {
        "status": "processed",
        "event_id": event_id,
        "record_id": record_id,
        "classification": classification,
        "reasoning": decision.get("reasoning", ""),
    }
