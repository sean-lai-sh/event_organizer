# Attio + Convex Compliance Plan

This document replaces the previous legacy CRM plan. As of March 11, 2026, the live system is Attio + Convex:

- Attio `people` records are identity records.
- Attio `speakers` list entries are workflow records.
- Convex stores events, thread links, internal ownership, and retry-safe processing state.

## Live Attio Contract

### `people` object

Use `people` for identity only:

- `record_id`
- `name`
- `email_addresses`
- `phone_numbers`
- standard profile fields such as `company`, `job_title`, `description`

Verified live: `people` does not currently expose the old pseudo-schema fields `outreach_status`, `contact_source`, `assigned_members`, `enrichment_status`, `relationship_stage`, `contact_type`, `career_profile`, or `last_agent_action_at`.

### `speakers` list

Live list:

- name: `Speakers-Mentors`
- api slug: `speakers`
- parent object: `people`

Verified writable list attributes:

| Attribute         | Type             | Live values / notes                                                                                        |
| ----------------- | ---------------- | ---------------------------------------------------------------------------------------------------------- |
| `status`          | status           | `Prospect`, `Outreach (Cold)`, `Outreach (Warm)`, `Engaged`, `Confirmed`, `Spoke`, `Mentoring`, `Declined` |
| `speaker_info`    | text             | summary text                                                                                               |
| `work_history`    | text             | JSON stored as text                                                                                        |
| `previous_events` | text             | JSON array of Convex event ids stored as text                                                              |
| `managed_poc`     | record-reference | references `people`; live field is currently multiselect                                                   |
| `assigned`        | text             | intended to hold Convex `eboard_members._id`                                                               |
| `source`          | select           | `warm`, `alumni`, `in bound`, `event`, `outreach`                                                          |
| `active_event_id` | text             | current Convex event id                                                                                    |

## Compliance Rules

These rules are the source of truth for future implementation:

1. Do not create or rely on Attio workflow fields on `people`.
2. Do not create an Attio `inbound_state` field. Speaker workflow lives in `speakers.status`.
3. Always write Attio select/status fields using the exact live option titles or resolved option ids.
4. `speakers.assigned` stores the Convex `eboard_members._id` as text.
5. `speakers.managed_poc` stores the Attio `people.record_id` of the owning eboard member.
6. Because `managed_poc` is currently multiselect in Attio, application code must write at most one record reference until the field is reconfigured.
7. `speakers.previous_events` remains a JSON array of Convex event ids serialized as text.
8. `speakers.active_event_id` stores the current Convex event id.
9. There must be at most one active `speakers` entry per parent `people.record_id`. Code should enforce this even though Attio does not currently guarantee it.
10. Attio notes may still be attached to the parent `people` record for audit history.

## Current Contradictions

### Documentation

- The previous plan described a legacy pre-Attio model and no longer matches the repo or the live Attio workspace.

### Attio client and agent runtime

- `backend/attio/client.py` still flattens and assumes non-existent `people` attributes such as `contact_source`, `outreach_status`, and `enrichment_status`.
- `agent/tools.py` still queries and writes those non-existent `people` fields.
- `agent/mcp_server.py` still exposes an MCP schema where workflow state lives on `people`.
- `agent/match.py` and `agent/outreach.py` still depend on `people`-level workflow fields and therefore cannot comply with the live Attio model.

### Convex model

- `event_outreach` stores only `attio_record_id`, which currently means the parent `people.record_id`. It does not store the Attio `speakers` list entry id required for direct list-entry updates.
- `event_outreach.inbound_state` is still used as the operational workflow state in code, while the agreed Attio workflow field is `speakers.status`.
- `eboard_members` does not store the Attio `people.record_id` needed to populate `speakers.managed_poc`.
- `contact_assignments` is keyed by `attio_record_id` rather than a `speakers` list entry id. This only remains safe if the system enforces one speaker entry per person.

### Runtime behavior

- `agent/reply_handler.py` upserts an Attio `people` record, but it does not ensure a `speakers` list entry exists and it never writes `status`, `source`, `active_event_id`, `assigned`, `managed_poc`, or `previous_events`.
- Webhook dedupe is recorded before Attio/Convex writes complete, so a partial failure can permanently suppress retries.

### Live Attio option mismatch

- Historical code values such as `warm_intro`, `agent_outreach`, and `inbound` do not match the live `speakers.source` options `warm`, `outreach`, and `in bound`.
- Historical code values such as `agent_active` do not match the live `speakers.status` pipeline.

## Target Convex Contract

### `events`

Keep the existing event table. No schema change is required here for Attio alignment.

### `event_outreach`

Keep the table as the event-specific linkage layer, but extend it:

- keep `attio_record_id` as the parent `people.record_id` for now to avoid a breaking migration
- add `attio_speakers_entry_id` as the durable Attio list-entry id
- keep `response` as event-specific reply state
- treat `inbound_state` as internal processing state only; it must not replace or drift from `speakers.status`

If a later migration is acceptable, rename `attio_record_id` to `attio_people_record_id`.

### `eboard_members`

Add:

- `attio_people_record_id: string | undefined`

Requirement:

- every active eboard member that can own speaker communication must have a corresponding Attio `people` record

### `contact_assignments`

Short term:

- current person-based keying may remain if one `speakers` entry per parent person is enforced

Long term if duplicates are allowed:

- migrate assignments to key by `attio_speakers_entry_id`

### `inbound_receipts`

Change behavior, not just schema:

- write the receipt only after Attio + Convex updates succeed
- or add processing status so failed attempts are retryable

### `invites`

Keep invite onboarding logic in Convex with explicit email binding support:

- `code` remains the one-time onboarding token
- `invited_email` optionally binds an invite to a single email address
- `used_email` records the email that consumed the invite
- `used_by` is best-effort and may be unset if consume runs before session hydration

Behavioral contract:

- validation and consume must reject mismatched `invited_email`
- consume must not rely exclusively on an authenticated session immediately after account creation

## Status and Source Mapping

### Inbound classification -> `speakers.status`

| Agent classification                    | Required `speakers.status` |
| --------------------------------------- | -------------------------- |
| `ACCEPTED`                              | `Confirmed`                |
| `DECLINED`                              | `Declined`                 |
| `QUESTION`                              | `Engaged`                  |
| `NEEDS_HUMAN`                           | `Engaged`                  |
| net-new inbound with no confirmed event | `Prospect`                 |

### Workflow-origin -> `speakers.source`

| Workflow origin                   | Required `speakers.source` |
| --------------------------------- | -------------------------- |
| cold outreach seeded by the agent | `outreach`                 |
| warm intro                        | `warm`                     |
| inbound email                     | `in bound`                 |
| sourced from past event activity  | `event`                    |
| alumni sourcing                   | `alumni`                   |

### Outbound stage initialization

Use the live status pipeline for outbound work:

- cold outbound send -> `Outreach (Cold)`
- warm intro outreach -> `Outreach (Warm)`
- once a real conversation is active -> `Engaged`

## Required Runtime Changes

### `backend/attio/client.py`

Implement Attio list-entry support for `speakers`:

- find a speaker entry by parent `people.record_id`
- create a speaker entry from a person record
- update list-entry attributes
- append or replace `previous_events`
- add dedicated flatteners for:
  - Attio `people` records
  - Attio `speakers` list entries

Do not keep a generic flattener that silently assumes workflow fields exist on `people`.

### `agent/tools.py`

Refactor helpers so that:

- identity upserts continue to target `people`
- workflow reads/writes target `speakers`
- assignment sync writes both:
  - Convex assignment history
  - `speakers.assigned`
- owner sync writes `speakers.managed_poc` from `eboard_members.attio_people_record_id`
- outreach helpers stop filtering on non-existent `enrichment_status` until a real enrichment field exists in Attio

### `agent/reply_handler.py`

Known-thread path must:

- load the linked speaker entry from `event_outreach.attio_speakers_entry_id`
- update `speakers.status`
- update `speakers.active_event_id`
- append the event id to `speakers.previous_events` when appropriate
- sync `assigned` and `managed_poc`
- only write inbound dedupe after successful completion

Net-new path must:

- upsert the sender in `people`
- ensure exactly one `speakers` entry exists
- set `source` to `in bound`
- set `status` using the mapping table above
- set `active_event_id` when a Convex event is created
- persist `attio_speakers_entry_id` on `event_outreach`

### `agent/match.py`

Move matching input away from pseudo-fields on `people`:

- read candidate workflow rows from `speakers`
- join each speaker entry to its parent `people` identity record
- use `speaker_info`, `work_history`, and parent identity data as ranking context

### `agent/outreach.py`

Before send:

- resolve the speaker entry for each parent person
- ensure `event_outreach` has both Attio ids

After send:

- set `speakers.status` to `Outreach (Cold)` or `Outreach (Warm)` as appropriate
- set `speakers.active_event_id`
- sync `assigned` if ownership is known
- keep note logging on the parent `people` record

### `agent/mcp_server.py`

Expose the real Attio model:

- `people` tools for identity reads/writes
- `speakers` tools for workflow reads/writes

Deprecate or remove tools that imply these `people` fields exist:

- `outreach_status`
- `contact_source`
- `assigned_members`
- `enrichment_status`
- any pseudo-field equivalent of `inbound_state`

## Verification

After the implementation changes land:

1. Re-run Attio validation against the live workspace.
2. Add an end-to-end test for known-thread inbound updating an existing speaker entry.
3. Add an end-to-end test for net-new inbound creating a `people` record plus `speakers` entry.
4. Add a retry test covering partial failure before dedupe is committed.
5. Add a regression test proving that the runtime writes the exact live Attio option titles:
   - `in bound`
   - `warm`
   - `outreach`
   - `Engaged`
   - `Confirmed`
   - `Declined`

Operational Guarantees

1. The Attio + Convex integration must maintain the following guarantees at runtime:
2. Identity and workflow separation people records remain identity-only.
3. speakers list entries remain the sole location for workflow state.
