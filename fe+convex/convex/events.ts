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

export const listEvents = query({
  args: {
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { status, limit }) => {
    const all = await ctx.db.query("events").order("desc").collect();
    const filtered = status ? all.filter((e) => e.status === status) : all;
    return limit === undefined ? filtered : filtered.slice(0, Math.max(0, limit));
  },
});

export const updateEvent = mutation({
  args: {
    event_id: v.id("events"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    event_date: v.optional(v.string()),
    event_time: v.optional(v.string()),
    event_end_time: v.optional(v.string()),
    location: v.optional(v.string()),
    status: v.optional(v.string()),
    speaker_confirmed: v.optional(v.boolean()),
    room_confirmed: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    {
      event_id,
      title,
      description,
      event_date,
      event_time,
      event_end_time,
      location,
      status,
      speaker_confirmed,
      room_confirmed,
    }
  ) => {
    const event = await ctx.db.get(event_id);
    if (!event) {
      throw new Error(`Event not found: ${event_id}`);
    }

    const patch: Record<string, unknown> = {};
    if (title !== undefined) patch.title = title;
    if (description !== undefined) patch.description = description;
    if (event_date !== undefined) patch.event_date = event_date;
    if (event_time !== undefined) patch.event_time = event_time;
    if (event_end_time !== undefined) patch.event_end_time = event_end_time;
    if (location !== undefined) patch.location = location;
    if (status !== undefined) patch.status = status;

    // Sticky milestone semantics: only allow these booleans to turn on.
    if (speaker_confirmed === true && event.speaker_confirmed !== true) {
      patch.speaker_confirmed = true;
    }
    if (room_confirmed === true && event.room_confirmed !== true) {
      patch.room_confirmed = true;
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(event_id, patch);
    }

    return await ctx.db.get(event_id);
  },
});

// ⚠️ Test-only — requires ALLOW_TEST_MUTATIONS=true in Convex env vars (dev only, never prod).
export const deleteEvent = mutation({
  args: { event_id: v.id("events") },
  handler: async (ctx, { event_id }) => {
    if (process.env.ALLOW_TEST_MUTATIONS !== "true") {
      throw new Error("deleteEvent is only callable in test environments");
    }
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
