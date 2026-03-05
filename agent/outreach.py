"""
Phase 3: Outreach — send personalized invite emails to approved contacts.

Trigger: POST /outreach/send { event_id, contact_ids }
Compute: Modal Function
"""
from __future__ import annotations

import json

import modal

from .tools import (
    CONTACT_PROPS,
    SupabaseClient,
    append_hubspot_notes,
    get_agentmail_client,
    llm_call,
)

app = modal.App("event-outreach-send")

image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "httpx>=0.27", "anthropic>=0.40", "agentmail", "python-dotenv", "pydantic>=2.0",
)

COMPOSE_SYSTEM_PROMPT = """\
You are writing a personalized event invitation email on behalf of a student club.

Guidelines:
- Reference the contact's specific background, skills, or interests to show this isn't spam
- Include all event details (title, date, time, location)
- Keep it concise (3-5 short paragraphs)
- Friendly, professional tone — not overly formal
- Clear call to action (RSVP or reply to confirm)
- Do NOT include a subject line — just the email body
- Sign off as the club (not a specific person)"""

AGENT_INBOX = None  # Set via env var AGENTMAIL_INBOX_ID or created on first use


async def _get_inbox_id() -> str:
    """Get or create the agent's outreach inbox."""
    import os
    inbox_id = os.environ.get("AGENTMAIL_INBOX_ID")
    if inbox_id:
        return inbox_id
    # Create one if not configured
    client = get_agentmail_client()
    inbox = client.inboxes.create()
    return inbox.id


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("event-outreach-secrets")],
    timeout=300,
)
async def send_outreach_for_event(event_id: str, contact_ids: list[str]) -> dict:
    """
    For each approved contact: compose a personalized email via LLM,
    send via AgentMail, update Supabase and HubSpot.

    Returns:
        { "event_id": str, "sent": [...], "errors": [...] }
    """
    from backend.hubspot.client import HubSpotClient

    # 0. Approve contacts in Supabase & update event status
    async with SupabaseClient() as sb:
        await sb.approve_contacts(event_id, contact_ids)
        event = await sb.get_event(event_id)
        await sb.update_event_status(event_id, "outreach")

    if not event:
        return {"error": f"Event {event_id} not found"}

    inbox_id = await _get_inbox_id()
    agentmail = get_agentmail_client()

    event_details = (
        f"Title: {event['title']}\n"
        f"Date: {event.get('event_date', 'TBD')}\n"
        f"Time: {event.get('event_time', 'TBD')}\n"
        f"Location: {event.get('location', 'TBD')}\n"
        f"Description: {event.get('description', '')}"
    )

    sent = []
    errors = []

    for contact_id in contact_ids:
        try:
            # a. Get full contact from HubSpot
            async with HubSpotClient() as hs:
                contact = await hs.get_contact(contact_id, properties=CONTACT_PROPS)
            props = contact.get("properties", {})
            name = f"{props.get('firstname', '')} {props.get('lastname', '')}".strip()
            email = props.get("email")
            if not email:
                errors.append({"contact_id": contact_id, "error": "No email"})
                continue

            # b. LLM composes personalized email
            user_prompt = (
                f"## Contact\n"
                f"Name: {name}\n"
                f"Type: {props.get('contact_type', 'prospect')}\n"
                f"Career Profile: {props.get('career_profile', 'N/A')}\n\n"
                f"## Event\n{event_details}"
            )
            email_body = await llm_call(COMPOSE_SYSTEM_PROMPT, user_prompt, max_tokens=1024)

            # c. Send via AgentMail
            subject = f"Invitation: {event['title']}"
            message = agentmail.inboxes.messages.send(
                inbox_id=inbox_id,
                to=email,
                subject=subject,
                text=email_body,
                labels=["outreach", event_id],
            )

            # d. Update Supabase
            async with SupabaseClient() as sb:
                await sb.update_outreach(event_id, contact_id, {
                    "outreach_sent": True,
                    "agentmail_thread_id": message.thread_id,
                })

            # e. Update HubSpot
            await append_hubspot_notes(
                contact_id,
                f"Invited to {event['title']}. thread_id={message.thread_id}",
                outreach_status="agent_active",
            )

            sent.append({
                "contact_id": contact_id,
                "name": name,
                "thread_id": message.thread_id,
            })

        except Exception as e:
            errors.append({"contact_id": contact_id, "error": str(e)})

    return {"event_id": event_id, "sent": sent, "errors": errors}
