# Event Organizer Agent Guide

This file explains how the repo's live runtime, data models, and external systems interact in practice.

## Canonical Docs

- `PLAN.md` is the source of truth for architecture, data contracts, and compliance rules.
- `AGENTS.md` is the operator guide for how those systems are executed in practice.
- `IMPLEMENTATION.md` is the active work breakdown for the agent-first MVP.
- `DESIGN.md` is the source of truth for frontend layout and visual consistency.
- `README.md` is setup and local-dev documentation.

If `AGENTS.md` and `PLAN.md` ever disagree, fix `AGENTS.md` to match `PLAN.md` or update both in the same change.
If frontend styling guidance in `AGENTS.md` and `DESIGN.md` diverge, update both in the same change.

## System Boundaries

### Attio

Attio is the CRM system of record.

- `people` is the identity layer.
- `speakers` is the workflow layer.
- Attio notes may be attached to the parent `people` record for audit history.

Do not store speaker workflow state on `people`.

### Convex

Convex is the operational application database.

- `events` stores event objects.
- `event_outreach` stores event-specific outreach links, thread ids, response metadata, and retry-safe processing state.
- `attendance` stores per-event attendee check-ins keyed by Convex event id and attendee email.
- `attendance_insights` stores generated attendance analysis snapshots for the dashboard data page.
- `eboard_members` stores internal club members.
- `contact_assignments` stores internal ownership history.
- `inbound_receipts` stores webhook dedupe state.
- `invites` stores invite-code access control for onboarding.
- `agent_threads` stores conversation shells.
- `agent_messages` stores normalized conversation messages.
- `agent_runs` stores normalized run lifecycle records.
- `agent_artifacts` stores renderable agent outputs.
- `agent_approvals` stores approval gates and decisions.
- `agent_context_links` stores links between conversations and product entities.

Convex is not the source of truth for identity or speaker workflow fields that already live in Attio.
Convex is also not the source of truth for agent orchestration policy.

### Agent Runtime

Modal-hosted Python agent code coordinates the systems and is the authoritative execution layer.

- `agent/helper/attio.py` wraps Attio API access.
- `agent/helper/tools.py` contains shared Attio and Convex helpers.
- `agent/helper/attio.py` wraps Attio API access.
- `agent/helper/tools.py` contains shared Attio and Convex helpers.
- `agent/match.py` handles candidate selection.
- `agent/outreach.py` handles outbound sends.
- `agent/reply_handler.py` handles inbound email processing.
- `agent/apps/mcp/service.py` is the packaged FastMCP implementation used by the runtime.
- `agent/apps/mcp/server.py` is the stdio launcher the runtime starts through the Claude agent SDK.
- `agent/mcp_server.py` is a compatibility shim for local tooling and tests.
- Modal-hosted conversational endpoints own thread runs, approvals, artifacts, and policy.
- Anthropic Agent SDK is used inside Modal as the harness layer only.

### Thin Clients

Next.js and Discord are thin clients over the same Modal runtime.

They may:

- list threads
- create or resume threads
- start runs
- render streamed output
- render artifacts and approvals
- submit approval decisions

They must not:

- choose tools locally
- implement guardrails locally
- bypass Modal approval policy
- become independent orchestration paths

## Data Model Responsibilities

### Attio `people`

Use `people` for identity and profile data only:

- `record_id`
- `name`
- `email_addresses`
- `phone_numbers`
- standard fields like `company`, `job_title`, and `description`

Do not assume `people` has workflow fields such as:

- `outreach_status`
- `contact_source`
- `assigned_members`
- `enrichment_status`
- `relationship_stage`
- `contact_type`
- `career_profile`
- `last_agent_action_at`

### Attio `speakers`

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

- `status` is the speaker workflow state.
- `source` must use the exact live option titles.
- `assigned` stores Convex `eboard_members._id` as text.
- `managed_poc` stores an Attio `people.record_id` for the owning eboard member.
- `previous_events` is a JSON array of Convex event ids serialized as text.
- `active_event_id` is the current Convex event id as text.

### Convex Tables

#### `events`

Stores application event records and milestone booleans.

#### `event_outreach`

Stores the per-event link to an Attio person and, once implemented, the Attio speaker entry id.

Current intended meaning:

- `attio_record_id` = parent Attio `people.record_id`
- `attio_speakers_entry_id` = Attio `speakers` list entry id
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

Stores AI-generated or manually authored summaries derived from attendance analytics.

Current intended meaning:

- `generated_at` = timestamp when the insight was written
- `insight_text` = short analysis shown on the dashboard
- `data_snapshot` = optional JSON payload used as model context
- `event_count` = number of tracked events in the analyzed snapshot
- `attendee_count` = unique attendee count in the analyzed snapshot

`attendance_insights` is append-only history; the frontend reads the most recent row.

#### `agent_threads`

Stores durable thread identity for web and Discord conversations.

#### `agent_messages`

Stores normalized message content for rendering and continuation.

#### `agent_runs`

Stores normalized run status and step metadata.

#### `agent_artifacts`

Stores renderable outputs such as tables, metrics, timelines, checklists, reports, charts, and link bundles.

#### `agent_approvals`

Stores pending and completed approvals for Modal-side actions.

#### `agent_context_links`

Stores optional links between threads/runs and events, speakers, people, or communication threads.

#### `eboard_members`

Stores internal ownership records keyed by Better Auth user id.

Required extension:

- `attio_people_record_id`

Without that field, code cannot safely populate `speakers.managed_poc`.

#### `contact_assignments`

Stores internal assignment history.

Short-term contract:

- if the system enforces one speaker entry per Attio person, person-keyed assignments are acceptable

Long-term contract:

- if multiple speaker entries per person are allowed, assignments must key by `attio_speakers_entry_id`

#### `inbound_receipts`

Stores message dedupe state.

Current intended meaning:

- `status` = receipt processing lifecycle such as `processing` or `completed`
- `lease_expires_at` = retry window for an in-flight processing claim
- `completed_at` = timestamp when dedupe was committed after successful processing

Write dedupe only after the related Attio and Convex mutations succeed, or make the receipt explicitly retryable.

#### `invites`

Stores invite-code onboarding state.

Current intended meaning:

- `code` = one-time invite token
- `invited_email` = optional locked email for this invite
- `used_email` = email used during successful consume
- `used_by` = Better Auth user id when a session is available at consume time

`invites.consume` must enforce `invited_email` when present and must not fail only because a session cookie is not available immediately after signup.

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

## Interaction Patterns

### Conversational run

1. A web or Discord client sends a thread action to Modal.
2. Modal assembles context, runs the Anthropic Agent SDK harness, and decides tool usage.
3. If a write or send action is required, Modal creates an approval record and pauses the run.
4. The client renders the normalized run, message, artifact, and approval state from Convex.
5. On approval, the client submits the decision back to Modal and the run resumes.

Current MCP tool surface:

- Attio `people` (identity only): `search_people`, `get_person`, `upsert_person`, `append_person_note`
- Attio `speakers` (workflow): `search_speakers`, `get_speaker`, `ensure_speaker_for_person`, `update_speaker_workflow`
- Temporary compatibility read aliases: `search_contacts`, `get_contact` (map to the people reads; do not accept workflow filters)
- Convex reads: `list_events`, `get_event`, `get_event_inbound_status`, `get_event_outreach`, `get_attendance_dashboard`, `get_event_attendance`, `get_event_room_booking`
- Approval-gated Convex writes: `update_event_safe`, `create_event`
- OnceHub live reads: `find_oncehub_slots`
- Approval-gated OnceHub writes: `book_oncehub_room`

The historical `create_contact` and `update_contact` tools have been retired because they wrote workflow state onto Attio `people`. Use `upsert_person` + `append_person_note` for identity and audit notes, and `ensure_speaker_for_person` + `update_speaker_workflow` for workflow state.

OnceHub data model:

- `event_room_bookings` (Convex) stores booking receipts — one row per event, upserted from the approved-booking write path. Fields cover the provider metadata (`provider`, `page_url`, `link_name`, `room_label`), the scheduled slot (`booked_date`, `booked_time`, `booked_end_time`, `duration_minutes`, `slot_start_epoch_ms`), and the OnceHub receipt (`booking_status`, `booking_reference`, `raw_response_json`).
- `events` remains the user-facing event record. An approved OnceHub booking stickies `events.room_confirmed = true` and, if no event existed yet, creates one from the booking details.
- Availability is always live via `find_oncehub_slots`; do not read the `room_availability` table for this MVP path.
- Bookings use the shared club booking profile from `agent/core/clients/booking_profile.json`. MVP scope covers first-time booking only; cancellation, rebooking, and manual-edit sync are out of scope.

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

## Non-Negotiable Rules For Future Changes

- Do not add new workflow fields to Attio `people`.
- Do not treat Convex `inbound_state` as the user-visible workflow state.
- Do not write Attio select or status values using guessed labels.
- Do not update assignment or ownership in Convex without also updating the corresponding Attio speaker entry when that path is implemented.
- Do not move tool policy or guardrails into Next.js or Discord.
- Do not expose raw Anthropic Agent SDK event payloads as product contracts.
- Do not introduce a second document that competes with `PLAN.md` as the data-contract source of truth.

## MVP Scope Guardrail

The active milestone is the agent-first MVP.

Only work that directly advances one of these should remain in active scope:

- `/agent` workspace
- Modal runtime
- Anthropic harness integration
- approvals and artifacts
- Discord parity on the same backend
- scoped context launchers
- required architecture-doc updates

## Frontend Design System

All UI screens live in `.pen` files. The design language is **strictly monochrome** — no color accents.
For dashboard shell, nav, spacing rhythm, and state contrast rules, follow `DESIGN.md`.

### Files

- `event_organizer.pen` — shared canonical screens (dashboard, events, landing, login). Do not add auth/user screens here to avoid merge conflicts.
- `event_organizer_user.pen` — auth flow screens (Invite Code, Sign Up, Sign In). Edit this file for onboarding UI changes.

### Design Tokens

| Token | Value | Usage |
|---|---|---|
| Text primary | `#0A0A0A` / `#111111` | Headings, labels, active nav |
| Text secondary | `#555555` | Input labels |
| Text muted | `#999999` | Subtitles, placeholder copy |
| Text disabled | `#BBBBBB` | Hints, footer copy, icons |
| Background page | `#FAFAFA` | Page/sidebar bg |
| Background panel | `#F4F4F4` | Cards, nav items |
| Background input | transparent | Inputs have no fill |
| Border default | `#E0E0E0` | Input strokes |
| Border divider | `#EBEBEB` | Section dividers |
| Button primary fill | `#0A0A0A` | All primary CTAs |
| Button primary text | `#FFFFFF` | |

### Typography

- **Font**: Inter (UI), Geist (dashboard wordmark/nav)
- **Display headings**: `fontWeight: 300`, tight `letterSpacing` (−2.5 to −4), `lineHeight: 0.97`
- **Section headings**: `fontSize: 28`, `fontWeight: 600`, `letterSpacing: -1`
- **Labels**: `fontSize: 13`, `fontWeight: 500`, `fill: #555555`
- **Body / placeholders**: `fontSize: 14`, `fill: #BBBBBB`
- **Footnotes / hints**: `fontSize: 12–13`, `fill: #999999`

### Component Patterns

**Input field** (`height: 44`, `cornerRadius: 8`, `padding: [0, 14]`):
- No background fill
- `stroke: { align: "inside", fill: "#E0E0E0", thickness: 1 }`

**Primary button** (`height: 44`, `cornerRadius: 8`):
- `fill: "#0A0A0A"`, label `fill: "#FFFFFF"`, `fontWeight: 600`

**Split-panel auth layout** (1280×900):
- Left `BrandPanel`: gradient `#FAFAFA→#F0F0F0`, `padding: 60`, `justifyContent: space_between` — logo top, headline+sub middle, footnote bottom
- Right `FormPanel`: `fill: #FFFFFF`, `width: 480`, `padding: [0, 60]`, `justifyContent: center`

### Rules

- No blue, green, red, or any chromatic color in UI elements. Error states use `#555555` or a muted indicator, not red.
- No drop shadows on cards or inputs. Shadow only on floating elements (e.g., `new event` button).
- Desktop-first. Auth screens target 1280×900. No mobile breakpoints in `.pen` files.
- Auth screens go in `event_organizer_user.pen`, never `event_organizer.pen`.

## When Updating The Model

If you change any of the following, update `PLAN.md` and this file in the same change:

- Attio field definitions
- Convex table meaning
- id mappings between Attio and Convex
- source or status vocabularies
- inbound or outbound synchronization behavior
