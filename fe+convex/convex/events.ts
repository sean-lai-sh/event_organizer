import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getEvent = query({
  args: { event_id: v.id("events") },
  handler: async (ctx, { event_id }) => {
    return await ctx.db.get(event_id);
  },
});

export const createEvent = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    event_date: v.optional(v.string()),
    event_time: v.optional(v.string()),
    event_end_time: v.optional(v.string()),
    location: v.optional(v.string()),
    event_type: v.optional(v.string()),
    target_profile: v.optional(v.string()),
    needs_outreach: v.boolean(),
    status: v.string(),
    created_by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("events", {
      ...args,
      speaker_confirmed: false,
      room_confirmed: false,
      created_at: Date.now(),
    });
  },
});

export const updateEventStatus = mutation({
  args: { event_id: v.id("events"), status: v.string() },
  handler: async (ctx, { event_id, status }) => {
    await ctx.db.patch(event_id, { status });
  },
});

export const updateEvent = mutation({
  args: {
    event_id: v.id("events"),
    title: v.string(),
    description: v.optional(v.string()),
    event_date: v.optional(v.string()),
    event_time: v.optional(v.string()),
    event_end_time: v.optional(v.string()),
    location: v.optional(v.string()),
    event_type: v.optional(v.string()),
    target_profile: v.optional(v.string()),
    needs_outreach: v.boolean(),
    status: v.string(),
  },
  handler: async (ctx, { event_id, ...patch }) => {
    const event = await ctx.db.get(event_id);
    if (!event) {
      throw new Error("Event not found.");
    }

    await ctx.db.patch(event_id, patch);
  },
});

export const listEvents = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, { status }) => {
    const all = await ctx.db.query("events").order("desc").collect();
    return status ? all.filter((e) => e.status === status) : all;
  },
});

export const deleteEvent = mutation({
  args: { event_id: v.id("events") },
  handler: async (ctx, { event_id }) => {
    const event = await ctx.db.get(event_id);
    if (!event) {
      throw new Error("Event not found.");
    }

    const outreachRows = await ctx.db
      .query("event_outreach")
      .withIndex("by_event_id", (q) => q.eq("event_id", event_id))
      .collect();

    await Promise.all(outreachRows.map((row) => ctx.db.delete(row._id)));
    await ctx.db.delete(event_id);
  },
});

export const applyInboundMilestones = mutation({
  args: {
    event_id: v.id("events"),
    speaker_confirmed: v.optional(v.boolean()),
    room_confirmed: v.optional(v.boolean()),
  },
  handler: async (ctx, { event_id, speaker_confirmed, room_confirmed }) => {
    const event = await ctx.db.get(event_id);
    if (!event) throw new Error(`Event not found: ${event_id}`);

    const patch: Record<string, unknown> = {};
    // Sticky true semantics: never auto-revert to false.
    if (speaker_confirmed === true && event.speaker_confirmed !== true) {
      patch.speaker_confirmed = true;
    }
    if (room_confirmed === true && event.room_confirmed !== true) {
      patch.room_confirmed = true;
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(event_id, patch);
    }
  },
});
