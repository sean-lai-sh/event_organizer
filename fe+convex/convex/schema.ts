import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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

  attendance: defineTable({
    event_id: v.id("events"),
    email: v.string(),
    name: v.optional(v.string()),
    checked_in_at: v.number(),
    source: v.optional(v.string()),
  })
    .index("by_event", ["event_id"])
    .index("by_email", ["email"])
    .index("by_event_email", ["event_id", "email"]),

  attendance_insights: defineTable({
    event_id: v.optional(v.id("events")),
    generated_at: v.number(),
    insight_text: v.string(),
    data_snapshot: v.optional(v.string()),
    event_count: v.number(),
    attendee_count: v.number(),
  }).index("by_event_id", ["event_id"]),
});
