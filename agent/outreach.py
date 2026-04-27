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

    inbox_id = os.environ.get("AGENTMAIL_INBOX_ID")
    if inbox_id:
        return inbox_id
    client = get_agentmail_client()
    inbox = client.inboxes.create()
    return inbox.id


@app.function(
    image=image,
    secrets=[secret("outreach")],
    timeout=300,
)
async def send_outreach_for_event(event_id: str, record_ids: list[str]) -> dict:
    try:
        from core.normalize.attio_vocab import normalize_speaker_source, normalize_speaker_status
        from helper.attio import AttioClient, flatten_record, flatten_speaker_entry
    except ModuleNotFoundError:  # pragma: no cover - package import fallback
        from agent.core.normalize.attio_vocab import normalize_speaker_source, normalize_speaker_status
        from agent.helper.attio import AttioClient, flatten_record, flatten_speaker_entry

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
                f"Company: {props.get('company') or 'N/A'}\n"
                f"Job Title: {props.get('job_title') or 'N/A'}\n"
                f"Description: {props.get('description') or 'N/A'}\n\n"
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
            )

            async with AttioClient() as attio:
                rows = await attio.search_speaker_entries(
                    {
                        "$and": [
                            {
                                "attribute": {"slug": "parent_record"},
                                "condition": "equals",
                                "value": record_id,
                            }
                        ]
                    },
                    limit=1,
                )
                if rows:
                    speaker_entry_id = flatten_speaker_entry(rows[0])["entry_id"]
                else:
                    created = await attio.create_speaker_entry(
                        {
                            "parent_record": [{"target_record_id": record_id}],
                            "source": [{"value": normalize_speaker_source("outreach")}],
                        }
                    )
                    speaker_entry_id = flatten_speaker_entry(created)["entry_id"]
                await attio.update_speaker_entry(
                    speaker_entry_id,
                    {
                        "status": [{"value": normalize_speaker_status("Engaged")}],
                        "source": [{"value": normalize_speaker_source("outreach")}],
                        "active_event_id": [{"value": event_id}],
                    },
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
