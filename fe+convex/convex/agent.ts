import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation } from "./_generated/server";

async function resolveThreadId(
  ctx: Pick<MutationCtx, "db">,
  args: { thread_id?: Id<"agent_threads">; external_id?: string }
) {
  if (args.thread_id) {
    const existing = await ctx.db.get(args.thread_id);
    if (existing) return args.thread_id;
  }

  if (args.external_id) {
    const existing = await ctx.db
      .query("agent_threads")
      .withIndex("by_external_id", (q) => q.eq("external_id", args.external_id))
      .unique();
    if (existing) return existing._id as Id<"agent_threads">;
  }

  throw new Error("Thread not found");
}

export const renameThread = mutation({
  args: {
    thread_id: v.optional(v.id("agent_threads")),
    external_id: v.optional(v.string()),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const title = args.title.trim();
    if (!title) {
      throw new Error("Thread title cannot be empty");
    }

    const threadId = await resolveThreadId(ctx, args);
    await ctx.db.patch(threadId, {
      title,
      updated_at: Date.now(),
    });

    return threadId;
  },
});

export const deleteThread = mutation({
  args: {
    thread_id: v.optional(v.id("agent_threads")),
    external_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const threadId = await resolveThreadId(ctx, args);

    const [runs, messages, artifacts, approvals, contextLinks] = await Promise.all([
      ctx.db
        .query("agent_runs")
        .withIndex("by_thread_id", (q) => q.eq("thread_id", threadId))
        .collect(),
      ctx.db
        .query("agent_messages")
        .withIndex("by_thread_id", (q) => q.eq("thread_id", threadId))
        .collect(),
      ctx.db
        .query("agent_artifacts")
        .withIndex("by_thread_id", (q) => q.eq("thread_id", threadId))
        .collect(),
      ctx.db
        .query("agent_approvals")
        .withIndex("by_thread_id", (q) => q.eq("thread_id", threadId))
        .collect(),
      ctx.db
        .query("agent_context_links")
        .withIndex("by_thread_id", (q) => q.eq("thread_id", threadId))
        .collect(),
    ]);

    await Promise.all([
      ...contextLinks.map((row) => ctx.db.delete(row._id)),
      ...approvals.map((row) => ctx.db.delete(row._id)),
      ...artifacts.map((row) => ctx.db.delete(row._id)),
      ...messages.map((row) => ctx.db.delete(row._id)),
      ...runs.map((row) => ctx.db.delete(row._id)),
    ]);

    await ctx.db.delete(threadId);
    return threadId;
  },
});
