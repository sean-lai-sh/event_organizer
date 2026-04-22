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

  const externalId = args.external_id;
  if (externalId) {
    const existing = await ctx.db
      .query("agent_threads")
      .withIndex("by_external_id", (q) => q.eq("external_id", externalId))
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
    id: v.optional(v.id("agent_threads")),
    external_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const threadId = await resolveThreadId(ctx, {
      thread_id: args.id,
      external_id: args.external_id,
    });

    const messages = await ctx.db
      .query("agent_messages")
      .withIndex("by_thread_id", (q) => q.eq("thread_id", threadId))
      .collect();
    for (const message of messages) {
      await ctx.db.delete(message._id);
    }

    const runs = await ctx.db
      .query("agent_runs")
      .withIndex("by_thread_id", (q) => q.eq("thread_id", threadId))
      .collect();
    for (const run of runs) {
      await ctx.db.delete(run._id);
    }

    const artifacts = await ctx.db
      .query("agent_artifacts")
      .withIndex("by_thread_id", (q) => q.eq("thread_id", threadId))
      .collect();
    for (const artifact of artifacts) {
      await ctx.db.delete(artifact._id);
    }

    const approvals = await ctx.db
      .query("agent_approvals")
      .withIndex("by_thread_id", (q) => q.eq("thread_id", threadId))
      .collect();
    for (const approval of approvals) {
      await ctx.db.delete(approval._id);
    }

    const contextLinks = await ctx.db
      .query("agent_context_links")
      .withIndex("by_thread_id", (q) => q.eq("thread_id", threadId))
      .collect();
    for (const contextLink of contextLinks) {
      await ctx.db.delete(contextLink._id);
    }

    await ctx.db.delete(threadId);
    return threadId;
  },
});
