import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { agentContentBlocksValidator } from "./agentStateValidators";

type AgentThread = Doc<"agent_threads">;
type AgentRun = Doc<"agent_runs">;
type AgentApproval = Doc<"agent_approvals">;
type AgentDbContext = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;
type AgentMutationContext = Pick<MutationCtx, "db">;

function definedPatch<T extends Record<string, unknown>>(values: T) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

function sortByUpdatedDesc<T extends { updated_at: number }>(rows: T[]) {
  return [...rows].sort((a, b) => b.updated_at - a.updated_at);
}

function sortByRequestedDesc<T extends { requested_at: number }>(rows: T[]) {
  return [...rows].sort((a, b) => b.requested_at - a.requested_at);
}

function sortBySequenceAsc<T extends { sequence_number: number }>(rows: T[]) {
  return [...rows].sort((a, b) => a.sequence_number - b.sequence_number);
}

function sortByOrderAsc<T extends { sort_order: number }>(rows: T[]) {
  return [...rows].sort((a, b) => a.sort_order - b.sort_order);
}

function sortByCreatedAsc<T extends { created_at: number }>(rows: T[]) {
  return [...rows].sort((a, b) => a.created_at - b.created_at);
}

async function getThreadByExternalId(ctx: AgentDbContext, externalId: string) {
  return await ctx.db
    .query("agent_threads")
    .withIndex("by_external_id", (q) => q.eq("external_id", externalId))
    .unique();
}

async function getRunByExternalId(ctx: AgentDbContext, externalId: string) {
  return await ctx.db
    .query("agent_runs")
    .withIndex("by_external_id", (q) => q.eq("external_id", externalId))
    .unique();
}

async function getMessageByExternalId(ctx: AgentDbContext, externalId: string) {
  return await ctx.db
    .query("agent_messages")
    .withIndex("by_external_id", (q) => q.eq("external_id", externalId))
    .unique();
}

async function getArtifactByExternalId(ctx: AgentDbContext, externalId: string) {
  return await ctx.db
    .query("agent_artifacts")
    .withIndex("by_external_id", (q) => q.eq("external_id", externalId))
    .unique();
}

async function getApprovalByExternalId(ctx: AgentDbContext, externalId: string) {
  return await ctx.db
    .query("agent_approvals")
    .withIndex("by_external_id", (q) => q.eq("external_id", externalId))
    .unique();
}

async function getContextLinkByKey(ctx: AgentDbContext, linkKey: string) {
  return await ctx.db
    .query("agent_context_links")
    .withIndex("by_link_key", (q) => q.eq("link_key", linkKey))
    .unique();
}

async function requireThread(
  ctx: AgentDbContext,
  args: { thread_id?: Id<"agent_threads">; external_id?: string }
) {
  if (args.thread_id) {
    const thread = await ctx.db.get(args.thread_id);
    if (thread) return thread as AgentThread;
  }
  if (args.external_id) {
    const thread = await getThreadByExternalId(ctx, args.external_id);
    if (thread) return thread as AgentThread;
  }
  throw new Error("A thread_id or external_id is required");
}

async function requireRun(
  ctx: AgentDbContext,
  args: { run_id?: Id<"agent_runs">; external_id?: string }
) {
  if (args.run_id) {
    const run = await ctx.db.get(args.run_id);
    if (run) return run as AgentRun;
  }
  if (args.external_id) {
    const run = await getRunByExternalId(ctx, args.external_id);
    if (run) return run as AgentRun;
  }
  throw new Error("A run_id or external_id is required");
}

async function patchThreadActivity(
  ctx: AgentMutationContext,
  threadId: Id<"agent_threads">,
  updates: {
    last_message_at?: number;
    last_run_started_at?: number;
    updated_at?: number;
  }
) {
  const thread = (await ctx.db.get(threadId)) as AgentThread | null;
  if (!thread) {
    throw new Error(`Thread not found: ${threadId}`);
  }

  await ctx.db.patch(
    threadId,
    definedPatch({
      last_message_at:
        updates.last_message_at !== undefined
          ? Math.max(thread.last_message_at ?? 0, updates.last_message_at)
          : undefined,
      last_run_started_at:
        updates.last_run_started_at !== undefined
          ? Math.max(thread.last_run_started_at ?? 0, updates.last_run_started_at)
          : undefined,
      updated_at: updates.updated_at ?? Date.now(),
    })
  );
}

export const listThreads = query({
  args: {
    status: v.optional(v.string()),
    channel: v.optional(v.string()),
    created_by_user_id: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { status, channel, created_by_user_id, limit }) => {
    const rows = await ctx.db.query("agent_threads").collect();
    const filtered = rows.filter((thread) => {
      if (status && thread.status !== status) return false;
      if (channel && thread.channel !== channel) return false;
      if (created_by_user_id && thread.created_by_user_id !== created_by_user_id) return false;
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      const aActivity = a.last_message_at ?? a.last_run_started_at ?? a.updated_at;
      const bActivity = b.last_message_at ?? b.last_run_started_at ?? b.updated_at;
      return bActivity - aActivity;
    });

    return limit ? sorted.slice(0, limit) : sorted;
  },
});

export const getThreadState = query({
  args: {
    thread_id: v.optional(v.id("agent_threads")),
    external_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const thread = await requireThread(ctx, args);

    const [runs, messages, artifacts, approvals, context_links] = await Promise.all([
      ctx.db
        .query("agent_runs")
        .withIndex("by_thread_id", (q) => q.eq("thread_id", thread._id))
        .collect(),
      ctx.db
        .query("agent_messages")
        .withIndex("by_thread_id", (q) => q.eq("thread_id", thread._id))
        .collect(),
      ctx.db
        .query("agent_artifacts")
        .withIndex("by_thread_id", (q) => q.eq("thread_id", thread._id))
        .collect(),
      ctx.db
        .query("agent_approvals")
        .withIndex("by_thread_id", (q) => q.eq("thread_id", thread._id))
        .collect(),
      ctx.db
        .query("agent_context_links")
        .withIndex("by_thread_id", (q) => q.eq("thread_id", thread._id))
        .collect(),
    ]);

    return {
      thread,
      runs: sortByUpdatedDesc(runs),
      messages: sortBySequenceAsc(messages),
      artifacts: sortByOrderAsc(artifacts),
      approvals: sortByRequestedDesc(approvals),
      context_links: sortByCreatedAsc(context_links),
    };
  },
});

export const getRunState = query({
  args: {
    run_id: v.optional(v.id("agent_runs")),
    external_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await requireRun(ctx, args);

    const [messages, artifacts, approvals, context_links] = await Promise.all([
      ctx.db
        .query("agent_messages")
        .withIndex("by_run_id", (q) => q.eq("run_id", run._id))
        .collect(),
      ctx.db
        .query("agent_artifacts")
        .withIndex("by_run_id", (q) => q.eq("run_id", run._id))
        .collect(),
      ctx.db
        .query("agent_approvals")
        .withIndex("by_run_id", (q) => q.eq("run_id", run._id))
        .collect(),
      ctx.db
        .query("agent_context_links")
        .withIndex("by_run_id", (q) => q.eq("run_id", run._id))
        .collect(),
    ]);

    return {
      run,
      messages: sortBySequenceAsc(messages),
      artifacts: sortByOrderAsc(artifacts),
      approvals: sortByRequestedDesc(approvals),
      context_links: sortByCreatedAsc(context_links),
    };
  },
});

export const listPendingApprovals = query({
  args: {
    thread_id: v.optional(v.id("agent_threads")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { thread_id, limit }) => {
    const rows = thread_id
      ? await ctx.db
          .query("agent_approvals")
          .withIndex("by_thread_id", (q) => q.eq("thread_id", thread_id))
          .collect()
      : await ctx.db
          .query("agent_approvals")
          .withIndex("by_status", (q) => q.eq("status", "pending"))
          .collect();

    const pending = sortByRequestedDesc(rows.filter((approval) => approval.status === "pending"));
    return limit ? pending.slice(0, limit) : pending;
  },
});

export const upsertThread = mutation({
  args: {
    external_id: v.string(),
    channel: v.string(),
    status: v.string(),
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    created_by_user_id: v.optional(v.string()),
    last_message_at: v.optional(v.number()),
    last_run_started_at: v.optional(v.number()),
    created_at: v.optional(v.number()),
    updated_at: v.optional(v.number()),
    archived_at: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.updated_at ?? Date.now();
    const existing = (await getThreadByExternalId(ctx, args.external_id)) as AgentThread | null;

    if (existing) {
      await ctx.db.patch(
        existing._id,
        definedPatch({
          channel: args.channel,
          status: args.status,
          title: args.title,
          summary: args.summary,
          created_by_user_id: args.created_by_user_id,
          last_message_at: args.last_message_at,
          last_run_started_at: args.last_run_started_at,
          archived_at: args.archived_at,
          updated_at: now,
        })
      );
      return existing._id;
    }

    return await ctx.db.insert("agent_threads", {
      external_id: args.external_id,
      channel: args.channel,
      status: args.status,
      title: args.title,
      summary: args.summary,
      created_by_user_id: args.created_by_user_id,
      last_message_at: args.last_message_at,
      last_run_started_at: args.last_run_started_at,
      archived_at: args.archived_at,
      created_at: args.created_at ?? now,
      updated_at: now,
    });
  },
});

export const upsertRun = mutation({
  args: {
    thread_id: v.id("agent_threads"),
    external_id: v.string(),
    status: v.string(),
    trigger_source: v.string(),
    mode: v.optional(v.string()),
    initiated_by_user_id: v.optional(v.string()),
    model: v.optional(v.string()),
    summary: v.optional(v.string()),
    error_message: v.optional(v.string()),
    started_at: v.optional(v.number()),
    completed_at: v.optional(v.number()),
    updated_at: v.optional(v.number()),
    latest_message_sequence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.updated_at ?? Date.now();
    const startedAt = args.started_at ?? now;
    const existing = (await getRunByExternalId(ctx, args.external_id)) as AgentRun | null;

    if (existing) {
      await ctx.db.patch(
        existing._id,
        definedPatch({
          thread_id: args.thread_id,
          status: args.status,
          trigger_source: args.trigger_source,
          mode: args.mode,
          initiated_by_user_id: args.initiated_by_user_id,
          model: args.model,
          summary: args.summary,
          error_message: args.error_message,
          started_at: args.started_at,
          completed_at: args.completed_at,
          latest_message_sequence: args.latest_message_sequence,
          updated_at: now,
        })
      );
      await patchThreadActivity(ctx, args.thread_id, {
        last_run_started_at: startedAt,
        updated_at: now,
      });
      return existing._id;
    }

    const runId = await ctx.db.insert("agent_runs", {
      thread_id: args.thread_id,
      external_id: args.external_id,
      status: args.status,
      trigger_source: args.trigger_source,
      mode: args.mode,
      initiated_by_user_id: args.initiated_by_user_id,
      model: args.model,
      summary: args.summary,
      error_message: args.error_message,
      started_at: startedAt,
      completed_at: args.completed_at,
      updated_at: now,
      latest_message_sequence: args.latest_message_sequence,
    });

    await patchThreadActivity(ctx, args.thread_id, {
      last_run_started_at: startedAt,
      updated_at: now,
    });

    return runId;
  },
});

export const appendMessage = mutation({
  args: {
    thread_id: v.id("agent_threads"),
    run_id: v.optional(v.id("agent_runs")),
    external_id: v.string(),
    role: v.string(),
    status: v.string(),
    sequence_number: v.number(),
    plain_text: v.optional(v.string()),
    content_blocks: agentContentBlocksValidator,
    created_at: v.optional(v.number()),
    updated_at: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.updated_at ?? Date.now();
    const createdAt = args.created_at ?? now;
    const existing = await getMessageByExternalId(ctx, args.external_id);

    if (existing) {
      await ctx.db.patch(
        existing._id,
        definedPatch({
          thread_id: args.thread_id,
          run_id: args.run_id,
          role: args.role,
          status: args.status,
          sequence_number: args.sequence_number,
          plain_text: args.plain_text,
          content_blocks: args.content_blocks,
          created_at: args.created_at,
          updated_at: now,
        })
      );
      await patchThreadActivity(ctx, args.thread_id, {
        last_message_at: createdAt,
        updated_at: now,
      });
      return existing._id;
    }

    const messageId = await ctx.db.insert("agent_messages", {
      thread_id: args.thread_id,
      run_id: args.run_id,
      external_id: args.external_id,
      role: args.role,
      status: args.status,
      sequence_number: args.sequence_number,
      plain_text: args.plain_text,
      content_blocks: args.content_blocks,
      created_at: createdAt,
      updated_at: now,
    });

    await patchThreadActivity(ctx, args.thread_id, {
      last_message_at: createdAt,
      updated_at: now,
    });

    return messageId;
  },
});

export const upsertArtifact = mutation({
  args: {
    thread_id: v.id("agent_threads"),
    run_id: v.optional(v.id("agent_runs")),
    external_id: v.string(),
    kind: v.string(),
    status: v.string(),
    sort_order: v.number(),
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    content_blocks: agentContentBlocksValidator,
    created_at: v.optional(v.number()),
    updated_at: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.updated_at ?? Date.now();
    const createdAt = args.created_at ?? now;
    const existing = await getArtifactByExternalId(ctx, args.external_id);

    if (existing) {
      await ctx.db.patch(
        existing._id,
        definedPatch({
          thread_id: args.thread_id,
          run_id: args.run_id,
          kind: args.kind,
          status: args.status,
          sort_order: args.sort_order,
          title: args.title,
          summary: args.summary,
          content_blocks: args.content_blocks,
          created_at: args.created_at,
          updated_at: now,
        })
      );
      return existing._id;
    }

    return await ctx.db.insert("agent_artifacts", {
      thread_id: args.thread_id,
      run_id: args.run_id,
      external_id: args.external_id,
      kind: args.kind,
      status: args.status,
      sort_order: args.sort_order,
      title: args.title,
      summary: args.summary,
      content_blocks: args.content_blocks,
      created_at: createdAt,
      updated_at: now,
    });
  },
});

export const upsertApproval = mutation({
  args: {
    thread_id: v.id("agent_threads"),
    run_id: v.id("agent_runs"),
    external_id: v.string(),
    status: v.string(),
    action_type: v.string(),
    title: v.string(),
    summary: v.optional(v.string()),
    risk_level: v.string(),
    payload_json: v.optional(v.string()),
    requested_at: v.optional(v.number()),
    expires_at: v.optional(v.number()),
    resolved_at: v.optional(v.number()),
    decision_note: v.optional(v.string()),
    decided_by_user_id: v.optional(v.string()),
    updated_at: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.updated_at ?? Date.now();
    const requestedAt = args.requested_at ?? now;
    const existing = (await getApprovalByExternalId(ctx, args.external_id)) as AgentApproval | null;

    if (existing) {
      await ctx.db.patch(
        existing._id,
        definedPatch({
          thread_id: args.thread_id,
          run_id: args.run_id,
          status: args.status,
          action_type: args.action_type,
          title: args.title,
          summary: args.summary,
          risk_level: args.risk_level,
          payload_json: args.payload_json,
          requested_at: args.requested_at,
          expires_at: args.expires_at,
          resolved_at: args.resolved_at,
          decision_note: args.decision_note,
          decided_by_user_id: args.decided_by_user_id,
          updated_at: now,
        })
      );
      return existing._id;
    }

    return await ctx.db.insert("agent_approvals", {
      thread_id: args.thread_id,
      run_id: args.run_id,
      external_id: args.external_id,
      status: args.status,
      action_type: args.action_type,
      title: args.title,
      summary: args.summary,
      risk_level: args.risk_level,
      payload_json: args.payload_json,
      requested_at: requestedAt,
      expires_at: args.expires_at,
      resolved_at: args.resolved_at,
      decision_note: args.decision_note,
      decided_by_user_id: args.decided_by_user_id,
      updated_at: now,
    });
  },
});

export const resolveApproval = mutation({
  args: {
    external_id: v.string(),
    status: v.string(),
    decision_note: v.optional(v.string()),
    decided_by_user_id: v.optional(v.string()),
    resolved_at: v.optional(v.number()),
    updated_at: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const approval = await getApprovalByExternalId(ctx, args.external_id);
    if (!approval) {
      throw new Error(`Approval not found: ${args.external_id}`);
    }

    const now = args.updated_at ?? Date.now();
    await ctx.db.patch(
      approval._id,
      definedPatch({
        status: args.status,
        decision_note: args.decision_note,
        decided_by_user_id: args.decided_by_user_id,
        resolved_at: args.resolved_at ?? now,
        updated_at: now,
      })
    );

    return approval._id;
  },
});

export const upsertContextLink = mutation({
  args: {
    thread_id: v.id("agent_threads"),
    run_id: v.optional(v.id("agent_runs")),
    link_key: v.string(),
    relation: v.string(),
    entity_type: v.string(),
    entity_id: v.string(),
    label: v.optional(v.string()),
    url: v.optional(v.string()),
    metadata_json: v.optional(v.string()),
    created_at: v.optional(v.number()),
    updated_at: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.updated_at ?? Date.now();
    const createdAt = args.created_at ?? now;
    const existing = await getContextLinkByKey(ctx, args.link_key);

    if (existing) {
      await ctx.db.patch(
        existing._id,
        definedPatch({
          thread_id: args.thread_id,
          run_id: args.run_id,
          relation: args.relation,
          entity_type: args.entity_type,
          entity_id: args.entity_id,
          label: args.label,
          url: args.url,
          metadata_json: args.metadata_json,
          created_at: args.created_at,
          updated_at: now,
        })
      );
      return existing._id;
    }

    return await ctx.db.insert("agent_context_links", {
      thread_id: args.thread_id,
      run_id: args.run_id,
      link_key: args.link_key,
      relation: args.relation,
      entity_type: args.entity_type,
      entity_id: args.entity_id,
      label: args.label,
      url: args.url,
      metadata_json: args.metadata_json,
      created_at: createdAt,
      updated_at: now,
    });
  },
});
