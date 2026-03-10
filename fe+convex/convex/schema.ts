import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  events: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    event_date: v.string(),        // "YYYY-MM-DD"
    event_time: v.optional(v.string()),
    event_end_time: v.optional(v.string()),
    location: v.optional(v.string()),
    event_type: v.optional(v.string()),  // speaker_panel | workshop | networking | social
    target_profile: v.optional(v.string()),
    needs_outreach: v.boolean(),
    status: v.string(),            // draft | matching | outreach | completed
    created_by: v.optional(v.string()),  // eboard member email
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
    created_at: v.number(),
  })
    .index("by_event_id", ["event_id"])
    .index("by_thread_id", ["agentmail_thread_id"])
    .index("by_event_attio", ["event_id", "attio_record_id"]),

  eboard_members: defineTable({
    email: v.string(),
    name: v.string(),
    role: v.optional(v.string()),
    active: v.boolean(),
    created_at: v.number(),
  }).index("by_email", ["email"]),

  contact_assignments: defineTable({
    attio_record_id: v.string(),
    member_email: v.string(),
    assigned_at: v.number(),
  })
    .index("by_member_email", ["member_email"])
    .index("by_record_id", ["attio_record_id"]),
});
