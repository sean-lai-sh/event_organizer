import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdminOrAgent } from "./eboard";

const TERMINAL_STATUSES = new Set(["sent", "failed", "discarded"]);

export const getDraftByExternalId = query({
  args: {
    external_id: v.string(),
    _agent_token: v.optional(v.string()),
  },
  handler: async (ctx, { external_id, _agent_token }) => {
    await requireAdminOrAgent(ctx, _agent_token);
    const draft = await ctx.db
      .query("agent_email_drafts")
      .withIndex("by_external_id", (q) => q.eq("external_id", external_id))
      .unique();
    return draft ?? null;
  },
});

export const createDraft = mutation({
  args: {
    external_id: v.string(),
    thread_id: v.id("agent_threads"),
    run_id: v.optional(v.id("agent_runs")),
    to_name: v.string(),
    to_email: v.string(),
    subject: v.string(),
    body: v.string(),
    from_name: v.optional(v.string()),
    from_email: v.optional(v.string()),
    signature: v.optional(v.string()),
    _agent_token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { _agent_token, external_id, ...rest } = args;
    await requireAdminOrAgent(ctx, _agent_token);

    const existing = await ctx.db
      .query("agent_email_drafts")
      .withIndex("by_external_id", (q) => q.eq("external_id", external_id))
      .unique();
    if (existing) {
      // Idempotent — agent retries shouldn't create duplicate drafts.
      return existing._id;
    }

    const now = Date.now();
    return await ctx.db.insert("agent_email_drafts", {
      external_id,
      ...rest,
      status: "draft",
      created_at: now,
      updated_at: now,
    });
  },
});

export const updateDraftFields = mutation({
  args: {
    external_id: v.string(),
    to_name: v.optional(v.string()),
    to_email: v.optional(v.string()),
    subject: v.optional(v.string()),
    body: v.optional(v.string()),
    _agent_token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { _agent_token, external_id, ...patch } = args;
    await requireAdminOrAgent(ctx, _agent_token);

    const draft = await ctx.db
      .query("agent_email_drafts")
      .withIndex("by_external_id", (q) => q.eq("external_id", external_id))
      .unique();
    if (!draft) throw new Error(`Email draft not found: ${external_id}`);
    if (draft.status !== "draft") {
      throw new Error(
        `Email draft ${external_id} cannot be edited (status=${draft.status})`
      );
    }

    const fields: Record<string, unknown> = {};
    if (patch.to_name !== undefined) fields.to_name = patch.to_name;
    if (patch.to_email !== undefined) fields.to_email = patch.to_email;
    if (patch.subject !== undefined) fields.subject = patch.subject;
    if (patch.body !== undefined) fields.body = patch.body;
    if (Object.keys(fields).length === 0) return draft._id;

    fields.updated_at = Date.now();
    await ctx.db.patch(draft._id, fields);
    return draft._id;
  },
});

export const markSending = mutation({
  args: {
    external_id: v.string(),
    sent_by_user_id: v.optional(v.string()),
    _agent_token: v.optional(v.string()),
  },
  handler: async (ctx, { external_id, sent_by_user_id, _agent_token }) => {
    await requireAdminOrAgent(ctx, _agent_token);

    const draft = await ctx.db
      .query("agent_email_drafts")
      .withIndex("by_external_id", (q) => q.eq("external_id", external_id))
      .unique();
    if (!draft) throw new Error(`Email draft not found: ${external_id}`);
    // Only `draft` may transition to `sending`. This is the send lock — if two
    // requests race, only the first sees status `draft` and proceeds; the
    // second sees `sending`/`sent`/etc. and bails out before AgentMail is
    // called twice for the same recipient.
    if (draft.status !== "draft") {
      throw new Error(
        `Email draft ${external_id} cannot be sent (status=${draft.status})`
      );
    }

    const patch: Record<string, unknown> = {
      status: "sending",
      updated_at: Date.now(),
    };
    if (sent_by_user_id !== undefined) patch.sent_by_user_id = sent_by_user_id;
    await ctx.db.patch(draft._id, patch);
    return draft._id;
  },
});

export const markSent = mutation({
  args: {
    external_id: v.string(),
    agentmail_message_id: v.string(),
    sent_at: v.optional(v.number()),
    _agent_token: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { external_id, agentmail_message_id, sent_at, _agent_token }
  ) => {
    await requireAdminOrAgent(ctx, _agent_token);

    const draft = await ctx.db
      .query("agent_email_drafts")
      .withIndex("by_external_id", (q) => q.eq("external_id", external_id))
      .unique();
    if (!draft) throw new Error(`Email draft not found: ${external_id}`);

    const now = Date.now();
    await ctx.db.patch(draft._id, {
      status: "sent",
      agentmail_message_id,
      sent_at: sent_at ?? now,
      updated_at: now,
    });
    return draft._id;
  },
});

export const markFailed = mutation({
  args: {
    external_id: v.string(),
    error_message: v.string(),
    _agent_token: v.optional(v.string()),
  },
  handler: async (ctx, { external_id, error_message, _agent_token }) => {
    await requireAdminOrAgent(ctx, _agent_token);

    const draft = await ctx.db
      .query("agent_email_drafts")
      .withIndex("by_external_id", (q) => q.eq("external_id", external_id))
      .unique();
    if (!draft) throw new Error(`Email draft not found: ${external_id}`);

    await ctx.db.patch(draft._id, {
      status: "failed",
      error_message,
      updated_at: Date.now(),
    });
    return draft._id;
  },
});

export const markDiscarded = mutation({
  args: {
    external_id: v.string(),
    _agent_token: v.optional(v.string()),
  },
  handler: async (ctx, { external_id, _agent_token }) => {
    await requireAdminOrAgent(ctx, _agent_token);

    const draft = await ctx.db
      .query("agent_email_drafts")
      .withIndex("by_external_id", (q) => q.eq("external_id", external_id))
      .unique();
    if (!draft) throw new Error(`Email draft not found: ${external_id}`);
    if (TERMINAL_STATUSES.has(draft.status)) {
      // Already terminal — discarding a sent message would be misleading.
      throw new Error(
        `Email draft ${external_id} already finalized (status=${draft.status})`
      );
    }

    await ctx.db.patch(draft._id, {
      status: "discarded",
      updated_at: Date.now(),
    });
    return draft._id;
  },
});

export const VALID_STATUSES = [
  "draft",
  "sending",
  "sent",
  "failed",
  "discarded",
] as const;
