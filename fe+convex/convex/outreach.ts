import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const insertOutreachRows = mutation({
  args: {
    rows: v.array(
      v.object({
        event_id: v.id("events"),
        attio_record_id: v.string(),
        suggested: v.boolean(),
        approved: v.boolean(),
        response: v.string(),
      })
    ),
  },
  handler: async (ctx, { rows }) => {
    return await Promise.all(
      rows.map((row) =>
        ctx.db.insert("event_outreach", {
          ...row,
          outreach_sent: false,
          created_at: Date.now(),
        })
      )
    );
  },
});

export const getOutreachForEvent = query({
  args: { event_id: v.id("events"), approved: v.optional(v.boolean()) },
  handler: async (ctx, { event_id, approved }) => {
    const rows = await ctx.db
      .query("event_outreach")
      .withIndex("by_event_id", (q) => q.eq("event_id", event_id))
      .collect();
    return approved !== undefined ? rows.filter((r) => r.approved === approved) : rows;
  },
});

export const updateOutreach = mutation({
  args: {
    event_id: v.id("events"),
    attio_record_id: v.string(),
    // all update fields are optional — pass only what changes
    approved: v.optional(v.boolean()),
    outreach_sent: v.optional(v.boolean()),
    agentmail_thread_id: v.optional(v.string()),
    response: v.optional(v.string()),
  },
  handler: async (ctx, { event_id, attio_record_id, ...updates }) => {
    const row = await ctx.db
      .query("event_outreach")
      .withIndex("by_event_attio", (q) =>
        q.eq("event_id", event_id).eq("attio_record_id", attio_record_id)
      )
      .unique();
    if (!row) throw new Error(`No outreach row: event=${event_id} record=${attio_record_id}`);

    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(updates)) {
      if (v !== undefined) patch[k] = v;
    }
    await ctx.db.patch(row._id, patch);
  },
});

export const findByThread = query({
  args: { thread_id: v.string() },
  handler: async (ctx, { thread_id }) => {
    return await ctx.db
      .query("event_outreach")
      .withIndex("by_thread_id", (q) => q.eq("agentmail_thread_id", thread_id))
      .first();
  },
});
