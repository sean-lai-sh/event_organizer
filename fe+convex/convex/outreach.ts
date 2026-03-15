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
          inbound_state: "needs_review",
          inbound_count: 0,
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
    inbound_state: v.optional(v.string()),
    inbound_count: v.optional(v.number()),
    last_inbound_at: v.optional(v.number()),
    last_inbound_from: v.optional(v.string()),
    last_classification: v.optional(v.string()),
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

export const applyInboundUpdate = mutation({
  args: {
    event_id: v.id("events"),
    attio_record_id: v.string(),
    classification: v.string(),
    response: v.optional(v.string()),
    inbound_state: v.string(),
    sender_email: v.optional(v.string()),
    received_at: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { event_id, attio_record_id, classification, response, inbound_state, sender_email, received_at }
  ) => {
    const row = await ctx.db
      .query("event_outreach")
      .withIndex("by_event_attio", (q) =>
        q.eq("event_id", event_id).eq("attio_record_id", attio_record_id)
      )
      .unique();
    if (!row) throw new Error(`No outreach row: event=${event_id} record=${attio_record_id}`);

    const patch: Record<string, unknown> = {
      inbound_state,
      last_classification: classification,
      last_inbound_at: received_at ?? Date.now(),
      inbound_count: (row.inbound_count ?? 0) + 1,
    };
    if (sender_email !== undefined) patch.last_inbound_from = sender_email;
    if (response !== undefined) patch.response = response;

    await ctx.db.patch(row._id, patch);
  },
});

export const upsertOutreachLink = mutation({
  args: {
    event_id: v.id("events"),
    attio_record_id: v.string(),
    thread_id: v.optional(v.string()),
  },
  handler: async (ctx, { event_id, attio_record_id, thread_id }) => {
    const existing = await ctx.db
      .query("event_outreach")
      .withIndex("by_event_attio", (q) =>
        q.eq("event_id", event_id).eq("attio_record_id", attio_record_id)
      )
      .unique();

    if (existing) {
      if (thread_id && existing.agentmail_thread_id !== thread_id) {
        await ctx.db.patch(existing._id, { agentmail_thread_id: thread_id });
      }
      return existing._id;
    }

    return await ctx.db.insert("event_outreach", {
      event_id,
      attio_record_id,
      suggested: false,
      approved: true,
      outreach_sent: false,
      response: "pending",
      inbound_state: "needs_review",
      inbound_count: 0,
      agentmail_thread_id: thread_id,
      created_at: Date.now(),
    });
  },
});

export const recordInboundReceipt = mutation({
  args: {
    message_id: v.string(),
    thread_id: v.optional(v.string()),
  },
  handler: async (ctx, { message_id, thread_id }) => {
    const existing = await ctx.db
      .query("inbound_receipts")
      .withIndex("by_message_id", (q) => q.eq("message_id", message_id))
      .first();
    if (existing) {
      return { is_duplicate: true };
    }

    await ctx.db.insert("inbound_receipts", {
      message_id,
      thread_id,
      received_at: Date.now(),
    });
    return { is_duplicate: false };
  },
});

// ⚠️ Test-only — requires ALLOW_TEST_MUTATIONS=true in Convex env vars (dev only, never prod).
export const deleteOutreachForEvent = mutation({
  args: { event_id: v.id("events") },
  handler: async (ctx, { event_id }) => {
    if (process.env.ALLOW_TEST_MUTATIONS !== "true") {
      throw new Error("deleteOutreachForEvent is only callable in test environments");
    }
    const rows = await ctx.db
      .query("event_outreach")
      .withIndex("by_event_id", (q) => q.eq("event_id", event_id))
      .collect();
    await Promise.all(rows.map((r) => ctx.db.delete(r._id)));
    return rows.length;
  },
});

// ⚠️ Test-only — requires ALLOW_TEST_MUTATIONS=true in Convex env vars (dev only, never prod).
export const deleteInboundReceipt = mutation({
  args: { message_id: v.string() },
  handler: async (ctx, { message_id }) => {
    if (process.env.ALLOW_TEST_MUTATIONS !== "true") {
      throw new Error("deleteInboundReceipt is only callable in test environments");
    }
    const row = await ctx.db
      .query("inbound_receipts")
      .withIndex("by_message_id", (q) => q.eq("message_id", message_id))
      .first();
    if (row) await ctx.db.delete(row._id);
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
