import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { agentContentBlocksValidator } from "./agentStateValidators";

export default defineSchema({
  events: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    event_date: v.optional(v.string()), // "YYYY-MM-DD"
    event_time: v.optional(v.string()),
    event_end_time: v.optional(v.string()),
    location: v.optional(v.string()),
    event_type: v.optional(v.string()),  // speaker_panel | workshop | networking | social
    target_profile: v.optional(v.string()),
    needs_outreach: v.boolean(),
    status: v.string(),            // draft | matching | outreach | completed
    created_by: v.optional(v.string()),  // eboard member email
    // Sticky milestone flags (set true by inbound processing, manual reset if needed)
    speaker_confirmed: v.optional(v.boolean()),
    room_confirmed: v.optional(v.boolean()),
    created_at: v.number(),
  }),

  event_outreach: defineTable({
    event_id: v.id("events"),
    attio_record_id: v.string(),
    attio_speakers_entry_id: v.optional(v.string()),
    contact_name: v.optional(v.string()),
    contact_email: v.optional(v.string()),
    suggested: v.boolean(),
    approved: v.boolean(),
    outreach_sent: v.boolean(),
    response: v.optional(v.string()),   // accepted | declined | no_reply | pending
    agentmail_thread_id: v.optional(v.string()),
    inbound_state: v.optional(v.string()), // needs_review | awaiting_member_reply | resolved
    inbound_count: v.optional(v.number()),
    last_inbound_at: v.optional(v.number()),
    last_inbound_from: v.optional(v.string()),
    last_classification: v.optional(v.string()),
    created_at: v.number(),
  })
    .index("by_event_id", ["event_id"])
    .index("by_thread_id", ["agentmail_thread_id"])
    .index("by_attio_record_id", ["attio_record_id"])
    .index("by_event_attio", ["event_id", "attio_record_id"]),

  attendance: defineTable({
    event_id: v.id("events"),
    email: v.string(),
    name: v.optional(v.string()),
    checked_in_at: v.number(),
    source: v.optional(v.string()),
  })
    .index("by_event_id", ["event_id"])
    .index("by_email", ["email"])
    .index("by_event_email", ["event_id", "email"]),

  attendance_insights: defineTable({
    generated_at: v.number(),
    insight_text: v.string(),
    data_snapshot: v.optional(v.string()),
    event_count: v.number(),
    attendee_count: v.number(),
  }).index("by_generated_at", ["generated_at"]),

  agent_threads: defineTable({
    external_id: v.string(),
    channel: v.string(),
    status: v.string(),
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    created_by_user_id: v.optional(v.string()),
    last_message_at: v.optional(v.number()),
    last_run_started_at: v.optional(v.number()),
    archived_at: v.optional(v.number()),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_external_id", ["external_id"])
    .index("by_status", ["status"])
    .index("by_channel", ["channel"])
    .index("by_created_by_user_id", ["created_by_user_id"]),

  agent_runs: defineTable({
    thread_id: v.id("agent_threads"),
    external_id: v.string(),
    status: v.string(),
    trigger_source: v.string(),
    mode: v.optional(v.string()),
    initiated_by_user_id: v.optional(v.string()),
    model: v.optional(v.string()),
    summary: v.optional(v.string()),
    error_message: v.optional(v.string()),
    started_at: v.number(),
    completed_at: v.optional(v.number()),
    updated_at: v.number(),
    latest_message_sequence: v.optional(v.number()),
  })
    .index("by_external_id", ["external_id"])
    .index("by_thread_id", ["thread_id"])
    .index("by_thread_status", ["thread_id", "status"]),

  agent_messages: defineTable({
    thread_id: v.id("agent_threads"),
    run_id: v.optional(v.id("agent_runs")),
    external_id: v.string(),
    role: v.string(),
    status: v.string(),
    sequence_number: v.number(),
    plain_text: v.optional(v.string()),
    content_blocks: agentContentBlocksValidator,
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_external_id", ["external_id"])
    .index("by_thread_id", ["thread_id"])
    .index("by_run_id", ["run_id"])
    .index("by_thread_sequence", ["thread_id", "sequence_number"]),

  agent_artifacts: defineTable({
    thread_id: v.id("agent_threads"),
    run_id: v.optional(v.id("agent_runs")),
    external_id: v.string(),
    kind: v.string(),
    status: v.string(),
    sort_order: v.number(),
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    content_blocks: agentContentBlocksValidator,
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_external_id", ["external_id"])
    .index("by_thread_id", ["thread_id"])
    .index("by_run_id", ["run_id"])
    .index("by_thread_sort_order", ["thread_id", "sort_order"]),

  agent_approvals: defineTable({
    thread_id: v.id("agent_threads"),
    run_id: v.id("agent_runs"),
    external_id: v.string(),
    status: v.string(),
    action_type: v.string(),
    title: v.string(),
    summary: v.optional(v.string()),
    risk_level: v.string(),
    payload_json: v.optional(v.string()),
    requested_at: v.number(),
    expires_at: v.optional(v.number()),
    resolved_at: v.optional(v.number()),
    decision_note: v.optional(v.string()),
    decided_by_user_id: v.optional(v.string()),
    updated_at: v.number(),
  })
    .index("by_external_id", ["external_id"])
    .index("by_thread_id", ["thread_id"])
    .index("by_run_id", ["run_id"])
    .index("by_status", ["status"])
    .index("by_thread_status", ["thread_id", "status"]),

  approval_drafts: defineTable({
    approval_external_id: v.string(),
    user_id: v.string(),
    step: v.number(),
    overrides_json: v.string(),
    updated_at: v.number(),
  }).index("by_approval_user", ["approval_external_id", "user_id"]),

  agent_traces: defineTable({
    thread_id: v.id("agent_threads"),
    run_id: v.id("agent_runs"),
    external_id: v.string(),
    kind: v.string(),
    sequence_number: v.number(),
    summary: v.string(),
    detail_json: v.optional(v.string()),
    status: v.string(),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_external_id", ["external_id"])
    .index("by_thread_id", ["thread_id"])
    .index("by_run_id", ["run_id"])
    .index("by_run_sequence", ["run_id", "sequence_number"]),

  agent_context_links: defineTable({
    thread_id: v.id("agent_threads"),
    run_id: v.optional(v.id("agent_runs")),
    link_key: v.string(),
    relation: v.string(),
    entity_type: v.string(),
    entity_id: v.string(),
    label: v.optional(v.string()),
    url: v.optional(v.string()),
    metadata_json: v.optional(v.string()),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_link_key", ["link_key"])
    .index("by_thread_id", ["thread_id"])
    .index("by_run_id", ["run_id"])
    .index("by_entity", ["entity_type", "entity_id"]),

  eboard_members: defineTable({
    userId: v.string(),             // Better Auth user._id (opaque string)
    role: v.optional(v.string()),
    active: v.boolean(),
    created_at: v.number(),
  }).index("by_userId", ["userId"]),

  contact_assignments: defineTable({
    attio_record_id: v.string(),
    memberId: v.id("eboard_members"),  // typed Convex ref
    assigned_at: v.number(),
  })
    .index("by_member_id", ["memberId"])
    .index("by_record_id", ["attio_record_id"])
    .index("by_record_member", ["attio_record_id", "memberId"]),

  inbound_receipts: defineTable({
    message_id: v.string(),
    thread_id: v.optional(v.string()),
    received_at: v.number(),
    status: v.optional(v.string()),
    lease_expires_at: v.optional(v.number()),
    processing_started_at: v.optional(v.number()),
    completed_at: v.optional(v.number()),
    updated_at: v.optional(v.number()),
  }).index("by_message_id", ["message_id"]),

  invites: defineTable({
    code: v.string(),
    invited_email: v.optional(v.string()), // optional email lock for this invite
    created_by: v.optional(v.string()), // userId of the eboard member who created it
    used_by: v.optional(v.string()),    // userId who consumed it (single-use only)
    used_email: v.optional(v.string()), // email address used when consuming invite
    used_at: v.optional(v.number()),
    expires_at: v.optional(v.number()),
    created_at: v.number(),
    grants_role: v.optional(v.string()),  // role to assign on consume ("admin" | "member" etc.)
    max_uses: v.optional(v.number()),     // set for multi-use link invites; omitted/undefined = single-use
    use_count: v.optional(v.number()),    // tracks how many times a multi-use invite has been used
  }).index("by_code", ["code"]),

  room_availability: defineTable({
    room: v.string(),              // "Pre-money conference room (fits 12 people)"
    date: v.string(),              // "2026-03-28"
    day_of_week: v.string(),       // "Saturday"
    time_slot: v.string(),         // "10:00 AM"
    available: v.boolean(),
    duration_minutes: v.number(),  // 90
    scraped_at: v.number(),        // Date.now() — when this data was captured
  })
    .index("by_room", ["room"])
    .index("by_date", ["date"])
    .index("by_room_date", ["room", "date"]),

  // OnceHub booking receipts for events. One row per event; upsert semantics.
  // `events` stays the user-facing event record; provider receipts live here.
  event_room_bookings: defineTable({
    event_id: v.id("events"),
    provider: v.string(),              // "oncehub"
    page_url: v.string(),
    link_name: v.string(),
    room_label: v.string(),            // "Lean/Launchpad"
    booking_status: v.string(),        // "confirmed" | "pending" | "failed"
    booked_date: v.string(),           // "YYYY-MM-DD"
    booked_time: v.string(),           // "6:30 PM"
    booked_end_time: v.string(),       // "8:00 PM"
    duration_minutes: v.number(),
    slot_start_epoch_ms: v.number(),
    booking_reference: v.optional(v.string()),
    booking_reference_json: v.optional(v.string()),
    approver_user_id: v.optional(v.string()),
    raw_response_json: v.string(),
    created_at: v.number(),
    updated_at: v.number(),
  }).index("by_event_id", ["event_id"]),
});
