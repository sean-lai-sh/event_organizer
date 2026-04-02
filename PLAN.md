# Agent-First Architecture Plan

`PLAN.md` is the source of truth for system contracts, ownership rules, and compliance requirements.

If runtime behavior, data contracts, or ownership rules change, update this file first and keep `AGENTS.md` aligned in the same change.

## Product Direction

The active product direction is an agent-first MVP:

- `/agent` is the default authenticated workspace
- dashboard routes remain as structured drill-down tools
- Modal is the execution authority for all agent logic
- Convex persists product state and normalized agent interaction history
- Attio remains the CRM system of record
- Discord is a second client of the same agent runtime

The web app and Discord client must never become independent orchestration layers.

## System Ownership

### Attio

Attio is the CRM system of record.

- `people` is the identity layer
- `speakers` is the workflow layer
- Attio notes may be attached to the parent `people` record for audit history

Do not store speaker workflow state on `people`.

### Convex

Convex is the operational application database and product query layer.

Existing business tables:

- `events`
- `event_outreach`
- `attendance`
- `attendance_insights`
- `eboard_members`
- `contact_assignments`
- `inbound_receipts`
- `invites`

Agent-first persistence tables to add:

- `agent_threads`
- `agent_messages`
- `agent_runs`
- `agent_artifacts`
- `agent_approvals`
- `agent_context_links`

Convex stores normalized thread, run, artifact, and approval history for product rendering and continuation.
Convex is not the source of truth for agent execution policy.

### Modal Runtime

Modal is the authoritative execution plane for all agent behavior.

The Modal runtime owns:

- prompt assembly
- model execution
- Anthropic Agent SDK harness lifecycle
- tool selection and tool execution
- MCP access
- approval gating
- guardrails and policy enforcement
- artifact generation
- run state transitions

Next.js and Discord may proxy authenticated requests, but they must not make execution decisions locally.

### Anthropic Agent SDK

The Anthropic Agent SDK is the runtime harness inside Modal.

Use it for:

- run orchestration
- streaming assistant output
- tool loop management
- step tracing
- handoff between model output, tool execution, and approval pauses

Do not treat the SDK as the business-logic layer.

Repo-specific logic must remain in local modules:

- Attio wrappers
- Convex synchronization
- MCP adapters
- artifact normalization
- approval policy and risk classification

Application code should depend on an internal runtime adapter, not directly on SDK-specific primitives across the repo.

## Canonical Agent API

Modal exposes the canonical agent API surface:

- `POST /agent/threads`
  - create or resume a thread with optional context
- `GET /agent/threads/:id`
  - return normalized thread, message, artifact, and approval state
- `POST /agent/runs`
  - start a run for a thread
- `GET /agent/runs/:id/stream`
  - stream assistant output, tool activity, and artifact events
- `POST /agent/approvals/:id`
  - approve or reject a pending action

Implementation rules:

- Modal remains authoritative for run lifecycle and approval state
- Convex stores synchronized normalized records for UI and history
- clients render state; they do not decide state

## Agent-First UI Contract

The authenticated app should converge on this shape:

- `/agent` as primary landing route
- left rail for threads and recent work
- center conversation timeline for streaming responses and approvals
- right artifact canvas for rendered outputs

Scoped launchers must exist from:

- events
- speakers
- communications

These launchers may open the full `/agent` route or a scoped modal entrypoint, but they must pass context into the same shared thread/run model.

## Attio Contract

### `people`

Use `people` for identity and profile data only:

- `record_id`
- `name`
- `email_addresses`
- `phone_numbers`
- standard fields such as `company`, `job_title`, and `description`

Do not assume `people` has workflow fields such as:

- `outreach_status`
- `contact_source`
- `assigned_members`
- `enrichment_status`
- `relationship_stage`
- `contact_type`
- `career_profile`
- `last_agent_action_at`

### `speakers`

Use `speakers` list entries for outreach and speaker workflow:

- `status`
- `source`
- `active_event_id`
- `assigned`
- `managed_poc`
- `previous_events`
- `speaker_info`
- `work_history`

Live rules:

- `status` is the speaker workflow state
- `source` must use the exact live Attio option titles
- `assigned` stores Convex `eboard_members._id` as text
- `managed_poc` stores an Attio `people.record_id` for the owning eboard member
- `previous_events` is a JSON array of Convex event ids serialized as text
- `active_event_id` is the current Convex event id as text

## Convex Contract

### Existing tables

#### `events`

Stores event objects and milestone booleans.

#### `event_outreach`

Stores the per-event link to an Attio person and the related speaker entry.

Current intended meaning:

- `attio_record_id` = parent Attio `people.record_id`
- `attio_speakers_entry_id` = Attio `speakers` entry id
- `response` = event-specific reply outcome
- `inbound_state` = internal processing state only

`inbound_state` must never replace `speakers.status`.

#### `attendance`

Stores event-specific attendee check-ins.

Current intended meaning:

- `event_id` = Convex `events._id`
- `email` = normalized attendee email
- `name` = optional attendee display name from the import source
- `checked_in_at` = write timestamp for the attendance record
- `source` = optional ingest source such as `manual` or `csv_import`

`attendance` is the source for attendee analytics on `/dashboard/data`. It must remain deduplicated by `(event_id, email)`.

#### `attendance_insights`

Stores generated attendance analysis snapshots for the dashboard data page.

Current intended meaning:

- `generated_at` = timestamp when the insight was written
- `insight_text` = short analysis shown on the dashboard
- `data_snapshot` = optional JSON payload used as model context
- `event_count` = number of tracked events in the analyzed snapshot
- `attendee_count` = unique attendee count in the analyzed snapshot

`attendance_insights` is append-only history; the frontend reads the most recent row.

#### `eboard_members`

Stores internal ownership records keyed by Better Auth user id.

Required extension:

- `attio_people_record_id`

#### `contact_assignments`

Stores internal assignment history.

Short-term contract:

- if the system enforces one speaker entry per Attio person, person-keyed assignments are acceptable

Long-term contract:

- if multiple speaker entries per person are allowed, assignments must key by `attio_speakers_entry_id`

#### `inbound_receipts`

Stores message dedupe state.

Write dedupe only after the related Attio and Convex mutations succeed, or make the receipt explicitly retryable.

#### `invites`

Stores invite-code onboarding state.

Current intended meaning:

- `code` = one-time invite token
- `invited_email` = optional locked email for this invite
- `used_email` = email used during successful consume
- `used_by` = Better Auth user id when a session is available at consume time

`invites.consume` must enforce `invited_email` when present and must not fail only because a session cookie is not available immediately after signup.

### Agent-first tables

#### `agent_threads`

Stores durable conversations.

Required fields:

- owner identity
- title
- channel: `web` or `discord`
- external Modal thread id
- pinned context metadata
- last activity timestamp

#### `agent_messages`

Stores normalized message history.

Required fields:

- thread id
- role
- content blocks
- artifact references
- external Modal message id
- channel metadata

#### `agent_runs`

Stores normalized run lifecycle records.

Required fields:

- thread id
- external Modal run id
- status
- current step
- error state
- started and finished timestamps

#### `agent_artifacts`

Stores renderable outputs.

Allowed v1 artifact types:

- `metric_group`
- `table`
- `timeline`
- `checklist`
- `report`
- `chart`
- `link_bundle`

#### `agent_approvals`

Stores pending and completed approvals.

Required fields:

- run id or thread linkage
- external Modal approval id
- requested action
- risk level
- proposed action payload
- approver identity
- decision timestamp

#### `agent_context_links`

Stores optional links between conversations and product entities:

- event ids
- Attio person ids
- Attio speaker entry ids
- communication thread ids

## Shared Keys And Mappings

### Cross-system ids

- Attio person id: `people.record_id`
- Attio speaker workflow id: `speakers.entry_id`
- Convex event id: `events._id`
- Convex owner id: `eboard_members._id`

### Required field mappings

- `speakers.assigned` = Convex `eboard_members._id`
- `speakers.managed_poc` = Attio `people.record_id` for the owning eboard member
- `speakers.active_event_id` = Convex `events._id`
- `speakers.previous_events` = JSON array of Convex `events._id`

### Status mapping

- `ACCEPTED` -> `Confirmed`
- `DECLINED` -> `Declined`
- `QUESTION` -> `Engaged`
- `NEEDS_HUMAN` -> `Engaged`
- net-new inbound without a confirmed event -> `Prospect`

### Source mapping

Use the exact live Attio `speakers.source` option titles:

- cold outreach -> `outreach`
- warm intro -> `warm`
- inbound email -> `in bound`
- event sourcing -> `event`
- alumni sourcing -> `alumni`

Do not write historical labels like `warm_intro`, `agent_outreach`, or `inbound`.

## Runtime Rules

### Thin clients

Next.js and Discord are thin clients.

They may:

- start threads or runs
- render streamed output
- render approvals
- submit approval decisions
- deep-link into richer views

They must not:

- decide which tool to call
- apply guardrails locally
- bypass Modal execution policy
- mutate state directly in place of approved Modal actions

### Approval policy

Modal must enforce approval rules.

Default contract:

- read, analyze, and fetch tools may execute without approval
- write, send, destructive, or externally visible actions require explicit approval

The normalized approval decision must be persisted back to Convex.

### Artifact normalization

Anthropic Agent SDK events and internal tool output must be converted to the app’s normalized artifact model before persistence.

No frontend surface should depend on raw SDK event shapes.

## Interaction Patterns

### Outbound matching

1. Read event context from Convex `events`.
2. Read candidate workflow rows from Attio `speakers`.
3. Join each speaker entry to its parent Attio `people` record.
4. Write suggestions to Convex `event_outreach`.

### Outbound send

1. Resolve the target Attio `speakers` entry and parent `people` record.
2. Send the email.
3. Update Convex `event_outreach` with thread metadata.
4. Update Attio `speakers.status` and `speakers.active_event_id`.
5. Add a note to the parent Attio `people` record.

### Known-thread inbound

1. Resolve the Convex `event_outreach` row by thread id.
2. Resolve the linked Attio `speakers` entry.
3. Update Convex processing metadata.
4. Update Attio `speakers.status`, `assigned`, `managed_poc`, `active_event_id`, and `previous_events` as needed.
5. Commit dedupe only after the write path succeeds.

### Net-new inbound

1. Upsert the sender into Attio `people`.
2. Ensure exactly one Attio `speakers` entry exists for that person.
3. Create a Convex event if event extraction justifies it.
4. Link the new event in Convex `event_outreach`.
5. Set Attio `speakers.source` to `in bound`.
6. Set Attio `speakers.status` using the inbound mapping above.

## MVP Scope Control

### In scope

- `/agent` primary workspace
- Modal-hosted shared runtime
- Anthropic Agent SDK harness inside Modal
- Convex persistence for threads, runs, artifacts, approvals, and context links
- scoped launchers from Events, Speakers, and Communications
- Discord as the same conversation backend with thinner rendering
- documentation rewrite aligned to the new architecture

### Out of scope for MVP

- orchestration logic in Next.js
- autonomous background agents or scheduled multi-step workflows
- rich BI builders beyond fixed artifact types
- non-Discord integrations
- unrelated dashboard redesign work
- broad CRM refactors unrelated to the agent-first surface

### Backlog pruning

GitHub issues are the source of truth for MVP pruning.

Required milestone:

- `Agent-First MVP`

Required labels:

- `mvp-agent`
- `post-mvp`
- `close-as-out-of-scope`

Triage rule:

- if an issue does not directly advance `/agent`, Modal runtime, Anthropic harness, approvals, artifacts, Discord parity, scoped launchers, or the required doc rewrite, move it out of MVP

## Non-Negotiable Rules

- Do not add new workflow fields to Attio `people`.
- Do not treat Convex `inbound_state` as the user-visible workflow state.
- Do not write Attio select or status values using guessed labels.
- Do not move tool policy or guardrails into Next.js or Discord.
- Do not expose raw Anthropic Agent SDK event shapes as product contracts.
- Do not introduce a second document that competes with `PLAN.md` as the data-contract source of truth.
