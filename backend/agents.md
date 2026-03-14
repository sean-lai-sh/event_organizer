# Agent Reference

Everything an agent needs to read/write Convex, call Attio, and process email threads correctly.

---

## Convex API

The agent talks to Convex via its HTTP API using a deploy key. All calls require:
```
Authorization: Convex <CONVEX_DEPLOY_KEY>
Content-Type: application/json
POST https://<CONVEX_URL>/api/mutation   (for mutations)
POST https://<CONVEX_URL>/api/query      (for queries)
```

Body shape for mutations/queries:
```json
{
  "path": "moduleName:functionName",
  "args": { ... }
}
```

---

## Convex Tables & Schema

### `events`
```
_id              Id<"events">
title            string
status           string          // draft | matching | outreach | completed
event_type       string?         // speaker_panel | workshop | networking | social
event_date       string?         // "YYYY-MM-DD"
event_time       string?
event_end_time   string?
location         string?
target_profile   string?         // free-text description of ideal speaker profile
needs_outreach   boolean
created_by       string?         // eboard member email
speaker_confirmed boolean?       // STICKY — only ever set to true, never false
room_confirmed    boolean?       // STICKY — only ever set to true, never false
created_at       number          // ms epoch
```

### `event_outreach`
One row per (event, speaker contact) pair.
```
_id                   Id<"event_outreach">
event_id              Id<"events">
attio_record_id       string              // Attio people record_id — join key
suggested             boolean             // agent suggested this contact
approved              boolean             // eboard approved outreach
outreach_sent         boolean             // initial email sent
response              string?             // accepted | declined | no_reply | pending
agentmail_thread_id   string?             // links to AgentMail thread
inbound_state         string?             // needs_review | awaiting_member_reply | resolved
inbound_count         number?             // count of inbound messages on this thread
last_inbound_at       number?             // ms epoch of last inbound
last_inbound_from     string?             // email address of last sender
last_classification   string?             // agent's classification of last inbound
created_at            number
```
Indexes: `by_event_id`, `by_thread_id`, `by_attio_record_id`, `by_event_attio`

### `eboard_members`
```
_id         Id<"eboard_members">
userId      string               // Better Auth user._id
role        string?
active      boolean
created_at  number
```

### `contact_assignments`
Maps Attio contacts to specific eboard members.
```
_id               Id<"contact_assignments">
attio_record_id   string
memberId          Id<"eboard_members">
assigned_at       number
```

### `inbound_receipts`
Deduplication table — prevents processing the same email twice.
```
_id          Id<"inbound_receipts">
message_id   string   // email Message-ID header
thread_id    string?
received_at  number
```

---

## Convex Functions Reference

### outreach module

**`outreach:insertOutreachRows`** (mutation)
Called by agent after matching to persist suggested contacts.
```json
{
  "rows": [
    {
      "event_id": "<Id<events>>",
      "attio_record_id": "<attio record_id>",
      "suggested": true,
      "approved": false,
      "response": "pending"
    }
  ]
}
```
Returns: array of inserted `Id<"event_outreach">`.

---

**`outreach:getOutreachForEvent`** (query)
```json
{ "event_id": "<Id<events>>", "approved": true }
```
Returns all outreach rows for an event. Pass `approved: true` to get only approved rows.

---

**`outreach:updateOutreach`** (mutation)
Update any field on an outreach row. All update fields are optional — only pass what changes.
```json
{
  "event_id": "<Id<events>>",
  "attio_record_id": "<attio record_id>",
  "outreach_sent": true,
  "agentmail_thread_id": "<thread_id>",
  "response": "accepted",
  "inbound_state": "needs_review"
}
```

---

**`outreach:applyInboundUpdate`** (mutation)
Atomic update when an inbound email arrives. Increments `inbound_count`, sets `last_inbound_*`.
```json
{
  "event_id": "<Id<events>>",
  "attio_record_id": "<attio record_id>",
  "classification": "accepted",
  "response": "accepted",
  "inbound_state": "needs_review",
  "sender_email": "speaker@example.com",
  "received_at": 1710000000000
}
```

---

**`outreach:upsertOutreachLink`** (mutation)
Idempotent — creates the row if missing, or patches `agentmail_thread_id` if it has changed.
```json
{
  "event_id": "<Id<events>>",
  "attio_record_id": "<attio record_id>",
  "thread_id": "<agentmail thread_id>"
}
```
Returns: `Id<"event_outreach">`.

---

**`outreach:recordInboundReceipt`** (mutation)
**Call this first** before processing any inbound email. Returns `{ is_duplicate: true }` if already seen.
```json
{
  "message_id": "<email Message-ID header>",
  "thread_id": "<agentmail thread_id>"
}
```
Returns: `{ is_duplicate: boolean }`.

---

**`outreach:findByThread`** (query)
Look up outreach row from AgentMail thread ID.
```json
{ "thread_id": "<agentmail thread_id>" }
```
Returns: outreach row or null.

---

### events module

**`events:listEvents`** (query)
```json
{ "status": "outreach" }
```
Returns all events (optionally filtered by status).

---

**`events:getEvent`** (query)
```json
{ "event_id": "<Id<events>>" }
```

---

**`events:applyInboundMilestones`** (mutation)
Sticky setter — once `speaker_confirmed` or `room_confirmed` is true, it never reverts.
```json
{
  "event_id": "<Id<events>>",
  "speaker_confirmed": true
}
```

---

### contactAssignments module

**`contactAssignments:resolveAssigneesByRecord`** (query)
```json
{ "attio_record_id": "<attio record_id>" }
```
Returns assigned eboard members with user details (name, email, role).

---

**`contactAssignments:upsertAssignmentsByEmails`** (mutation)
```json
{
  "attio_record_id": "<attio record_id>",
  "emails": ["member@club.com"]
}
```
Returns `{ unresolved: string[] }` for emails that didn't match any eboard member.

---

### inboundDashboard module

**`inboundDashboard:getEventInboundStatus`** (query)
Full per-event summary for the dashboard. Pass no `event_id` to get all events.
```json
{ "event_id": "<Id<events>>" }
```
Returns: `{ event_id, title, status, summary: { threads, inbound_messages, accepted, declined, pending, needs_review, ... }, threads: [...] }`

---

## Inbound Email Processing — Standard Flow

Always follow this order when handling an inbound email reply:

```python
# 1. Dedup check — ALWAYS first
receipt = convex.mutation("outreach:recordInboundReceipt", {
    "message_id": email.message_id,
    "thread_id": email.thread_id,
})
if receipt["is_duplicate"]:
    return  # already processed

# 2. Find the outreach row
row = convex.query("outreach:findByThread", {"thread_id": email.thread_id})
if not row:
    # Unknown thread — log and exit
    return

# 3. Classify reply with Claude
classification = classify_email(email.body)
# classification ∈ {"accepted", "declined", "more_info", "scheduling", "not_relevant"}

# 4. Map classification → response field value
response_map = {
    "accepted": "accepted",
    "declined": "declined",
    "more_info": "pending",
    "scheduling": "accepted",
    "not_relevant": "declined",
}

# 5. Write back to Convex
convex.mutation("outreach:applyInboundUpdate", {
    "event_id": row["event_id"],
    "attio_record_id": row["attio_record_id"],
    "classification": classification,
    "response": response_map.get(classification),
    "inbound_state": "needs_review",
    "sender_email": email.sender,
    "received_at": int(email.received_at.timestamp() * 1000),
})

# 6. If speaker accepted, set sticky milestone
if classification in ("accepted", "scheduling"):
    convex.mutation("events:applyInboundMilestones", {
        "event_id": row["event_id"],
        "speaker_confirmed": True,
    })

# 7. Update Attio contact status
attio.update_contact(row["attio_record_id"], {
    "outreach_status": "in_conversation",
    "last_agent_action_at": datetime.utcnow().isoformat(),
})
```

---

## Attio CRM

Base URL: `https://api.attio.com/v2`
Auth: `Authorization: Bearer <ATTIO_KEY>`

### People record fields

Standard fields:
- `name` → `first_name`, `last_name`
- `email_addresses` → `email_address`
- `phone_numbers` → `phone_number`

Custom club fields (all single-value):
- `career_profile` — JSON blob (experience, education, skills, interests, linkedin_url)
- `relationship_stage` — `cold | active | spoken | persistent`
- `contact_source` — `warm_intro | agent_outreach | inbound | event`
- `contact_type` — `prospect | alumni | speaker | mentor | partner`
- `outreach_status` — `pending | agent_active | human_assigned | in_conversation | converted | paused | archived`
- `enrichment_status` — `pending | enriched | stale | failed`
- `assigned_members` — list of eboard member emails
- `warm_intro_by` — string (name/email of introducer)
- `last_agent_action_at` — ISO datetime

### Useful search filters

Speakers ready for outreach:
```json
{
  "$and": [
    { "contact_type": { "$in": ["speaker", "mentor"] } },
    { "outreach_status": { "$eq": "pending" } },
    { "enrichment_status": { "$eq": "enriched" } }
  ]
}
```

Contacts assigned to a specific member:
```json
{
  "assigned_members": { "$contains": "member@club.com" }
}
```

### `client.py` helpers

```python
from backend.attio.client import AttioClient, flatten_record

async with AttioClient() as client:
    records = await client.search_contacts(filter_={...}, limit=50)
    flat = [flatten_record(r) for r in records]
    # flat[i] keys: id, firstname, lastname, email, phone,
    #               career_profile, relationship_stage, contact_type,
    #               outreach_status, enrichment_status, assigned_members,
    #               last_agent_action_at, ...

    contact = await client.get_contact(record_id)
    await client.update_contact(record_id, {"outreach_status": "agent_active"})
    await client.create_note(record_id, title="Outreach", content="Sent speaker invite for...")
```

---

## AgentMail

Used for sending and reading email threads.

- `AGENTMAIL_API_KEY` — API token
- `AGENTMAIL_INBOX_ID` — the inbox ID used for outreach

`agentmail_thread_id` stored on `event_outreach` is the join key between AgentMail threads and Convex rows. Always call `upsertOutreachLink` after creating a thread to persist it.

---

## Environment Variables

```
# Convex — agent write-back
CONVEX_URL=https://<deployment>.convex.cloud
CONVEX_DEPLOY_KEY=...

# Attio CRM
ATTIO_KEY=...
ATTIO_API_KEY=...   # (some places use this name)

# AI
ANTHROPIC_API_KEY=...

# Email
AGENTMAIL_API_KEY=...
AGENTMAIL_INBOX_ID=...
```

---

## Key Invariants

1. **Always dedup inbound** — call `recordInboundReceipt` first, bail if `is_duplicate: true`
2. **Sticky milestones** — `speaker_confirmed` and `room_confirmed` only ever go `true`, never revert
3. **`attio_record_id` is the universal contact key** — used in `event_outreach`, `contact_assignments`, and Attio API calls
4. **`agentmail_thread_id` links email to Convex** — call `upsertOutreachLink` after starting a thread so inbound handler can find the row via `findByThread`
5. **Approved before sending** — only send outreach for rows where `approved: true`
