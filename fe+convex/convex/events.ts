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
    event_date: v.string(),
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
    return await ctx.db.insert("events", { ...args, created_at: Date.now() });
  },
});

export const updateEventStatus = mutation({
  args: { event_id: v.id("events"), status: v.string() },
  handler: async (ctx, { event_id, status }) => {
    await ctx.db.patch(event_id, { status });
  },
});

export const listEvents = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, { status }) => {
    const all = await ctx.db.query("events").order("desc").collect();
    return status ? all.filter((e) => e.status === status) : all;
  },
});
