# Event Organizer Agent Guide

This file explains how the repo's live data models and external sources interact.

## Canonical Docs

- `PLAN.md` is the source of truth for data contracts and compliance rules.
- `AGENTS.md` is the operator guide for how systems interact in practice.
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
- `eboard_members` stores internal club members.
- `contact_assignments` stores internal ownership history.
- `inbound_receipts` stores webhook dedupe state.
- `invites` stores invite-code access control for onboarding.

Convex is not the source of truth for identity or speaker workflow fields that already live in Attio.

### Agent Runtime

Python agent code coordinates the two systems.

- `backend/attio/` wraps Attio API access.
- `agent/tools.py` contains shared Attio and Convex helpers.
- `agent/match.py` handles candidate selection.
- `agent/outreach.py` handles outbound sends.
- `agent/reply_handler.py` handles inbound email processing.
- `agent/mcp_server.py` exposes CRM tools to other agents.

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
- Do not introduce a second document that competes with `PLAN.md` as the data-contract source of truth.

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
