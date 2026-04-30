"""
Phase 3: Outreach — send personalized invite emails to approved contacts.
"""
from __future__ import annotations

import modal

try:
    from core.modal.config import build_image, secret
    from helper.tools import ConvexClient, append_attio_note, get_agentmail_client, llm_call
except ModuleNotFoundError:  # pragma: no cover - package import fallback
    from agent.core.modal.config import build_image, secret
    from agent.helper.tools import ConvexClient, append_attio_note, get_agentmail_client, llm_call

app = modal.App("event-outreach-send")

image = build_image(extra_pip=["agentmail"])

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


async def _get_inbox_id() -> str:
    import os

    return os.environ.get("AGENTMAIL_INBOX_ID", "events-technyu@agentmail.to")


@app.function(
    image=image,
    secrets=[secret("outreach")],
    timeout=300,
)
async def send_outreach_for_event(event_id: str, record_ids: list[str]) -> dict:
    try:
        from helper.attio import AttioClient, flatten_record
    except ModuleNotFoundError:  # pragma: no cover - package import fallback
        from agent.helper.attio import AttioClient, flatten_record

    async with ConvexClient() as sb:
        await sb.approve_contacts(event_id, record_ids)
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

    for record_id in record_ids:
        try:
            async with AttioClient() as attio:
                record = await attio.get_contact(record_id)
            props = flatten_record(record)
            name = f"{props.get('firstname', '')} {props.get('lastname', '')}".strip()
            email = props.get("email")
            if not email:
                errors.append({"record_id": record_id, "error": "No email"})
                continue

            user_prompt = (
                f"## Contact\n"
                f"Name: {name}\n"
                f"Type: {props.get('contact_type', 'prospect')}\n"
                f"Career Profile: {props.get('career_profile', 'N/A')}\n\n"
                f"## Event\n{event_details}"
            )
            email_body = await llm_call(COMPOSE_SYSTEM_PROMPT, user_prompt, max_tokens=1024)

            subject = f"Invitation: {event['title']}"
            message = agentmail.inboxes.messages.send(
                inbox_id=inbox_id,
                to=email,
                subject=subject,
                text=email_body,
                labels=["outreach", event_id],
            )

            async with ConvexClient() as sb:
                await sb.update_outreach(
                    event_id,
                    record_id,
                    {"outreach_sent": True, "agentmail_thread_id": message.thread_id},
                )

            await append_attio_note(
                record_id,
                f"Invited to {event['title']}. thread_id={message.thread_id}",
                outreach_status="agent_active",
            )

            sent.append(
                {
                    "record_id": record_id,
                    "name": name,
                    "thread_id": message.thread_id,
                }
            )

        except Exception as exc:  # pragma: no cover - preserved behavior
            errors.append({"record_id": record_id, "error": str(exc)})

    return {"event_id": event_id, "sent": sent, "errors": errors}


__all__ = ["app", "image", "send_outreach_for_event"]
