import { describe, expect, test } from "bun:test";

import {
  appendMessage,
  appendTrace,
  getRunState,
  getThreadState,
  listPendingApprovals,
  listThreads,
  resolveApproval,
  upsertApproval,
  upsertArtifact,
  upsertContextLink,
  upsertRun,
  upsertThread,
} from "./agentState";

type TableName =
  | "agent_threads"
  | "agent_runs"
  | "agent_messages"
  | "agent_artifacts"
  | "agent_approvals"
  | "agent_traces"
  | "agent_context_links";

type TableRow = { _id: string } & Record<string, unknown>;
type Tables = Record<TableName, TableRow[]>;

class FakeIndexRangeBuilder {
  readonly filters: Array<[string, unknown]> = [];

  eq(field: string, value: unknown) {
    this.filters.push([field, value]);
    return this;
  }
}

class FakeQuery {
  constructor(
    private readonly rows: TableRow[],
    private readonly filters: Array<[string, unknown]> = []
  ) {}

  withIndex(_indexName: string, build: (builder: FakeIndexRangeBuilder) => unknown) {
    const builder = new FakeIndexRangeBuilder();
    build(builder);
    return new FakeQuery(this.rows, builder.filters);
  }

  async collect() {
    return this.rows.filter((row) =>
      this.filters.every(([field, value]) => row[field] === value)
    );
  }

  async first() {
    const matches = await this.collect();
    return matches[0] ?? null;
  }

  async unique() {
    const matches = await this.collect();
    return matches[0] ?? null;
  }
}

class FakeDb {
  private readonly counters: Record<TableName, number> = {
    agent_threads: 0,
    agent_runs: 0,
    agent_messages: 0,
    agent_artifacts: 0,
    agent_approvals: 0,
    agent_traces: 0,
    agent_context_links: 0,
  };

  readonly tables: Tables = {
    agent_threads: [],
    agent_runs: [],
    agent_messages: [],
    agent_artifacts: [],
    agent_approvals: [],
    agent_traces: [],
    agent_context_links: [],
  };

  query(table: TableName) {
    return new FakeQuery(this.tables[table]);
  }

  async get(id: string) {
    const table = id.split(":")[0] as TableName;
    return this.tables[table].find((row) => row._id === id) ?? null;
  }

  async insert(table: TableName, value: Record<string, unknown>) {
    const id = `${table}:${++this.counters[table]}`;
    this.tables[table].push({ _id: id, ...value });
    return id;
  }

  async patch(id: string, value: Record<string, unknown>) {
    const table = id.split(":")[0] as TableName;
    const index = this.tables[table].findIndex((row) => row._id === id);
    if (index === -1) {
      throw new Error(`Missing row: ${id}`);
    }

    this.tables[table][index] = {
      ...this.tables[table][index],
      ...value,
    };
  }

  rows(table: TableName) {
    return [...this.tables[table]];
  }
}

function installConvexHandlerAliases() {
  for (const fn of [
    appendMessage,
    appendTrace,
    getRunState,
    getThreadState,
    listPendingApprovals,
    listThreads,
    resolveApproval,
    upsertApproval,
    upsertArtifact,
    upsertContextLink,
    upsertRun,
    upsertThread,
  ]) {
    const wrapped = fn as typeof fn & { handler?: unknown; _handler?: unknown };
    if (!wrapped.handler) {
      wrapped.handler = wrapped._handler;
    }
  }
}

function getHandler<TArgs, TResult>(fn: unknown) {
  const wrapped = fn as {
    handler?: (ctx: unknown, args: TArgs) => Promise<TResult>;
    _handler?: (ctx: unknown, args: TArgs) => Promise<TResult>;
  };
  const handler = wrapped.handler ?? wrapped._handler;
  if (!handler) {
    throw new Error("Convex handler is unavailable in test harness");
  }
  return handler;
}

function createHarness() {
  installConvexHandlerAliases();

  const db = new FakeDb();
  const ctx = { db };

  return { db, ctx };
}

describe("agent state persistence", () => {
  test("stores and reads normalized thread state without raw runtime payloads", async () => {
    const { ctx, db } = createHarness();

    const threadId = await getHandler<
      {
        external_id: string;
        channel: string;
        status: string;
        title?: string;
        summary?: string;
        created_by_user_id?: string;
        created_at?: number;
        updated_at?: number;
      },
      string
    >(upsertThread)(ctx as never, {
      external_id: "thread_modal_1",
      channel: "web",
      status: "active",
      title: "Agent workspace",
      summary: "Initial planning thread",
      created_by_user_id: "user_1",
      created_at: 100,
      updated_at: 100,
    });

    const runId = await getHandler<
      {
        thread_id: string;
        external_id: string;
        status: string;
        trigger_source: string;
        started_at?: number;
        updated_at?: number;
        model?: string;
      },
      string
    >(upsertRun)(ctx as never, {
      thread_id: threadId,
      external_id: "run_modal_1",
      status: "running",
      trigger_source: "web",
      started_at: 110,
      updated_at: 110,
      model: "claude-sonnet",
    });

    await getHandler<
      {
        thread_id: string;
        external_id: string;
        role: string;
        status: string;
        sequence_number: number;
        plain_text?: string;
        content_blocks: Array<Record<string, string>>;
        created_at?: number;
        updated_at?: number;
      },
      string
    >(appendMessage)(ctx as never, {
      thread_id: threadId,
      external_id: "msg_user_1",
      role: "user",
      status: "complete",
      sequence_number: 1,
      plain_text: "Find speakers for next week.",
      content_blocks: [{ kind: "text", text: "Find speakers for next week." }],
      created_at: 115,
      updated_at: 115,
    });

    await getHandler<
      {
        thread_id: string;
        run_id?: string;
        external_id: string;
        role: string;
        status: string;
        sequence_number: number;
        plain_text?: string;
        content_blocks: Array<Record<string, string>>;
        created_at?: number;
        updated_at?: number;
      },
      string
    >(appendMessage)(ctx as never, {
      thread_id: threadId,
      run_id: runId,
      external_id: "msg_assistant_1",
      role: "assistant",
      status: "complete",
      sequence_number: 2,
      plain_text: "Here are three candidates and a shortlist summary.",
      content_blocks: [
        { kind: "markdown", text: "Here are three candidates and a shortlist summary." },
      ],
      created_at: 120,
      updated_at: 120,
    });

    await getHandler<
      {
        thread_id: string;
        run_id?: string;
        external_id: string;
        kind: string;
        status: string;
        sort_order: number;
        title?: string;
        content_blocks: Array<Record<string, string>>;
        created_at?: number;
        updated_at?: number;
      },
      string
    >(upsertArtifact)(ctx as never, {
      thread_id: threadId,
      run_id: runId,
      external_id: "artifact_2",
      kind: "checklist",
      status: "ready",
      sort_order: 2,
      title: "Next actions",
      content_blocks: [{ kind: "text", text: "Email top candidate." }],
      created_at: 130,
      updated_at: 130,
    });

    await getHandler<
      {
        thread_id: string;
        run_id?: string;
        external_id: string;
        kind: string;
        status: string;
        sort_order: number;
        title?: string;
        content_blocks: Array<Record<string, string>>;
        created_at?: number;
        updated_at?: number;
      },
      string
    >(upsertArtifact)(ctx as never, {
      thread_id: threadId,
      run_id: runId,
      external_id: "artifact_1",
      kind: "table",
      status: "ready",
      sort_order: 1,
      title: "Candidate matrix",
      content_blocks: [{ kind: "json", data_json: '{"rows":3}' }],
      created_at: 125,
      updated_at: 125,
    });

    await getHandler<
      {
        thread_id: string;
        run_id: string;
        external_id: string;
        status: string;
        action_type: string;
        title: string;
        risk_level: string;
        summary?: string;
        requested_at?: number;
        updated_at?: number;
      },
      string
    >(upsertApproval)(ctx as never, {
      thread_id: threadId,
      run_id: runId,
      external_id: "approval_1",
      status: "pending",
      action_type: "send_email",
      title: "Approve outreach draft",
      summary: "Send outreach to the first candidate.",
      risk_level: "medium",
      requested_at: 140,
      updated_at: 140,
    });

    await getHandler<
      {
        thread_id: string;
        run_id?: string;
        link_key: string;
        relation: string;
        entity_type: string;
        entity_id: string;
        label?: string;
        created_at?: number;
        updated_at?: number;
      },
      string
    >(upsertContextLink)(ctx as never, {
      thread_id: threadId,
      run_id: runId,
      link_key: "ctx_event_1",
      relation: "scoped_to",
      entity_type: "event",
      entity_id: "evt_123",
      label: "Launch event",
      created_at: 105,
      updated_at: 105,
    });

    const threadState = await getHandler<
      { external_id?: string; thread_id?: string },
      {
        thread: Record<string, unknown>;
        runs: Array<Record<string, unknown>>;
        messages: Array<Record<string, unknown>>;
        artifacts: Array<Record<string, unknown>>;
        approvals: Array<Record<string, unknown>>;
        context_links: Array<Record<string, unknown>>;
      }
    >(getThreadState)(ctx as never, { external_id: "thread_modal_1" });

    expect(threadState.thread._id).toBe(threadId);
    expect(threadState.runs.map((run) => run.external_id)).toEqual(["run_modal_1"]);
    expect(threadState.messages.map((message) => message.sequence_number)).toEqual([1, 2]);
    expect(threadState.artifacts.map((artifact) => artifact.external_id)).toEqual([
      "artifact_1",
      "artifact_2",
    ]);
    expect(threadState.approvals.map((approval) => approval.external_id)).toEqual(["approval_1"]);
    expect(threadState.context_links.map((link) => link.link_key)).toEqual(["ctx_event_1"]);

    const persistedThread = await db.get(threadId);
    expect(persistedThread).toMatchObject({
      last_message_at: 120,
      last_run_started_at: 110,
      updated_at: 120,
    });

    const runState = await getHandler<
      { external_id?: string; run_id?: string },
      {
        run: Record<string, unknown>;
        messages: Array<Record<string, unknown>>;
        artifacts: Array<Record<string, unknown>>;
        approvals: Array<Record<string, unknown>>;
        context_links: Array<Record<string, unknown>>;
      }
    >(getRunState)(ctx as never, { external_id: "run_modal_1" });

    expect(runState.run._id).toBe(runId);
    expect(runState.messages).toHaveLength(1);
    expect(runState.artifacts.map((artifact) => artifact.sort_order)).toEqual([1, 2]);
    expect(runState.approvals).toHaveLength(1);
    expect(runState.context_links).toHaveLength(1);
  });

  test("upserts stay idempotent on external ids and link keys", async () => {
    const { ctx, db } = createHarness();

    const threadId = await getHandler<
      {
        external_id: string;
        channel: string;
        status: string;
        summary?: string;
        updated_at?: number;
      },
      string
    >(upsertThread)(ctx as never, {
      external_id: "thread_modal_idempotent",
      channel: "discord",
      status: "active",
      summary: "first summary",
      updated_at: 10,
    });

    const threadIdAgain = await getHandler<
      {
        external_id: string;
        channel: string;
        status: string;
        summary?: string;
        updated_at?: number;
      },
      string
    >(upsertThread)(ctx as never, {
      external_id: "thread_modal_idempotent",
      channel: "discord",
      status: "active",
      summary: "updated summary",
      updated_at: 20,
    });

    const runId = await getHandler<
      {
        thread_id: string;
        external_id: string;
        status: string;
        trigger_source: string;
        updated_at?: number;
      },
      string
    >(upsertRun)(ctx as never, {
      thread_id: threadId,
      external_id: "run_modal_idempotent",
      status: "running",
      trigger_source: "discord",
      updated_at: 21,
    });

    const runIdAgain = await getHandler<
      {
        thread_id: string;
        external_id: string;
        status: string;
        trigger_source: string;
        completed_at?: number;
        updated_at?: number;
      },
      string
    >(upsertRun)(ctx as never, {
      thread_id: threadId,
      external_id: "run_modal_idempotent",
      status: "completed",
      trigger_source: "discord",
      completed_at: 30,
      updated_at: 30,
    });

    await getHandler<
      {
        thread_id: string;
        run_id?: string;
        external_id: string;
        role: string;
        status: string;
        sequence_number: number;
        plain_text?: string;
        content_blocks: Array<Record<string, string>>;
        updated_at?: number;
      },
      string
    >(appendMessage)(ctx as never, {
      thread_id: threadId,
      run_id: runId,
      external_id: "msg_modal_idempotent",
      role: "assistant",
      status: "streaming",
      sequence_number: 1,
      plain_text: "partial",
      content_blocks: [{ kind: "text", text: "partial" }],
      updated_at: 22,
    });

    await getHandler<
      {
        thread_id: string;
        run_id?: string;
        external_id: string;
        role: string;
        status: string;
        sequence_number: number;
        plain_text?: string;
        content_blocks: Array<Record<string, string>>;
        updated_at?: number;
      },
      string
    >(appendMessage)(ctx as never, {
      thread_id: threadId,
      run_id: runId,
      external_id: "msg_modal_idempotent",
      role: "assistant",
      status: "complete",
      sequence_number: 1,
      plain_text: "final body",
      content_blocks: [{ kind: "markdown", text: "final body" }],
      updated_at: 25,
    });

    await getHandler<
      {
        thread_id: string;
        run_id: string;
        external_id: string;
        status: string;
        action_type: string;
        title: string;
        risk_level: string;
        summary?: string;
        updated_at?: number;
      },
      string
    >(upsertApproval)(ctx as never, {
      thread_id: threadId,
      run_id: runId,
      external_id: "approval_modal_idempotent",
      status: "pending",
      action_type: "write_attio",
      title: "Approve CRM update",
      risk_level: "high",
      summary: "first",
      updated_at: 23,
    });

    await getHandler<
      {
        thread_id: string;
        run_id: string;
        external_id: string;
        status: string;
        action_type: string;
        title: string;
        risk_level: string;
        summary?: string;
        updated_at?: number;
      },
      string
    >(upsertApproval)(ctx as never, {
      thread_id: threadId,
      run_id: runId,
      external_id: "approval_modal_idempotent",
      status: "pending",
      action_type: "write_attio",
      title: "Approve CRM update",
      risk_level: "high",
      summary: "second",
      updated_at: 24,
    });

    await getHandler<
      {
        thread_id: string;
        run_id?: string;
        link_key: string;
        relation: string;
        entity_type: string;
        entity_id: string;
        label?: string;
        updated_at?: number;
      },
      string
    >(upsertContextLink)(ctx as never, {
      thread_id: threadId,
      run_id: runId,
      link_key: "ctx_modal_idempotent",
      relation: "references",
      entity_type: "speaker",
      entity_id: "speaker_1",
      label: "First label",
      updated_at: 24,
    });

    await getHandler<
      {
        thread_id: string;
        run_id?: string;
        link_key: string;
        relation: string;
        entity_type: string;
        entity_id: string;
        label?: string;
        updated_at?: number;
      },
      string
    >(upsertContextLink)(ctx as never, {
      thread_id: threadId,
      run_id: runId,
      link_key: "ctx_modal_idempotent",
      relation: "references",
      entity_type: "speaker",
      entity_id: "speaker_1",
      label: "Updated label",
      updated_at: 26,
    });

    expect(threadIdAgain).toBe(threadId);
    expect(runIdAgain).toBe(runId);
    expect(db.rows("agent_threads")).toHaveLength(1);
    expect(db.rows("agent_runs")).toHaveLength(1);
    expect(db.rows("agent_messages")).toHaveLength(1);
    expect(db.rows("agent_approvals")).toHaveLength(1);
    expect(db.rows("agent_context_links")).toHaveLength(1);

    expect(db.rows("agent_threads")[0]).toMatchObject({ summary: "updated summary" });
    expect(db.rows("agent_runs")[0]).toMatchObject({ status: "completed", completed_at: 30 });
    expect(db.rows("agent_messages")[0]).toMatchObject({
      status: "complete",
      plain_text: "final body",
    });
    expect(db.rows("agent_approvals")[0]).toMatchObject({ summary: "second" });
    expect(db.rows("agent_context_links")[0]).toMatchObject({ label: "Updated label" });
  });

  test("lists recent threads and resolves approvals", async () => {
    const { ctx, db } = createHarness();

    const olderThreadId = await getHandler<
      { external_id: string; channel: string; status: string; updated_at?: number },
      string
    >(upsertThread)(ctx as never, {
      external_id: "thread_old",
      channel: "web",
      status: "active",
      updated_at: 10,
    });

    const newerThreadId = await getHandler<
      { external_id: string; channel: string; status: string; updated_at?: number },
      string
    >(upsertThread)(ctx as never, {
      external_id: "thread_new",
      channel: "discord",
      status: "active",
      updated_at: 20,
    });

    const olderRunId = await getHandler<
      { thread_id: string; external_id: string; status: string; trigger_source: string; updated_at?: number },
      string
    >(upsertRun)(ctx as never, {
      thread_id: olderThreadId,
      external_id: "run_old",
      status: "awaiting_approval",
      trigger_source: "web",
      updated_at: 30,
    });

    const newerRunId = await getHandler<
      { thread_id: string; external_id: string; status: string; trigger_source: string; updated_at?: number },
      string
    >(upsertRun)(ctx as never, {
      thread_id: newerThreadId,
      external_id: "run_new",
      status: "awaiting_approval",
      trigger_source: "discord",
      updated_at: 40,
    });

    await getHandler<
      {
        thread_id: string;
        external_id: string;
        role: string;
        status: string;
        sequence_number: number;
        content_blocks: Array<Record<string, string>>;
        updated_at?: number;
      },
      string
    >(appendMessage)(ctx as never, {
      thread_id: newerThreadId,
      external_id: "msg_new",
      role: "assistant",
      status: "complete",
      sequence_number: 1,
      content_blocks: [{ kind: "text", text: "latest message" }],
      updated_at: 50,
    });

    await getHandler<
      {
        thread_id: string;
        run_id: string;
        external_id: string;
        status: string;
        action_type: string;
        title: string;
        risk_level: string;
        requested_at?: number;
        updated_at?: number;
      },
      string
    >(upsertApproval)(ctx as never, {
      thread_id: olderThreadId,
      run_id: olderRunId,
      external_id: "approval_old",
      status: "pending",
      action_type: "send_email",
      title: "Approve old draft",
      risk_level: "medium",
      requested_at: 35,
      updated_at: 35,
    });

    await getHandler<
      {
        thread_id: string;
        run_id: string;
        external_id: string;
        status: string;
        action_type: string;
        title: string;
        risk_level: string;
        requested_at?: number;
        updated_at?: number;
      },
      string
    >(upsertApproval)(ctx as never, {
      thread_id: newerThreadId,
      run_id: newerRunId,
      external_id: "approval_new",
      status: "pending",
      action_type: "write_convex",
      title: "Approve event update",
      risk_level: "low",
      requested_at: 45,
      updated_at: 45,
    });

    const threads = await getHandler<
      { status?: string; channel?: string; created_by_user_id?: string; limit?: number },
      Array<Record<string, unknown>>
    >(listThreads)(ctx as never, { limit: 2 });

    expect(threads.map((thread) => thread.external_id)).toEqual(["thread_new", "thread_old"]);

    const pendingBefore = await getHandler<
      { thread_id?: string; limit?: number },
      Array<Record<string, unknown>>
    >(listPendingApprovals)(ctx as never, {});
    expect(pendingBefore.map((approval) => approval.external_id)).toEqual([
      "approval_new",
      "approval_old",
    ]);

    await getHandler<
      {
        external_id: string;
        status: string;
        decision_note?: string;
        decided_by_user_id?: string;
        resolved_at?: number;
        updated_at?: number;
      },
      string
    >(resolveApproval)(ctx as never, {
      external_id: "approval_new",
      status: "approved",
      decision_note: "Looks good.",
      decided_by_user_id: "user_approver",
      resolved_at: 60,
      updated_at: 60,
    });

    const pendingAfter = await getHandler<
      { thread_id?: string; limit?: number },
      Array<Record<string, unknown>>
    >(listPendingApprovals)(ctx as never, {});

    expect(pendingAfter.map((approval) => approval.external_id)).toEqual(["approval_old"]);
    expect(db.rows("agent_approvals").find((approval) => approval.external_id === "approval_new")).toMatchObject({
      status: "approved",
      decided_by_user_id: "user_approver",
      resolved_at: 60,
    });
  });

  test("streaming assistant message patches one row by external_id and preserves sequence", async () => {
    const { ctx, db } = createHarness();

    const threadId = await getHandler<
      {
        external_id: string;
        channel: string;
        status: string;
        title?: string;
        created_at?: number;
        updated_at?: number;
      },
      string
    >(upsertThread)(ctx as never, {
      external_id: "thread_streaming_1",
      channel: "web",
      status: "active",
      title: "Streaming thread",
      created_at: 100,
      updated_at: 100,
    });

    const runId = await getHandler<
      {
        thread_id: string;
        external_id: string;
        status: string;
        trigger_source: string;
        started_at?: number;
        updated_at?: number;
      },
      string
    >(upsertRun)(ctx as never, {
      thread_id: threadId,
      external_id: "run_streaming_1",
      status: "running",
      trigger_source: "web",
      started_at: 110,
      updated_at: 110,
    });

    // 1. User message
    await getHandler<
      {
        thread_id: string;
        external_id: string;
        role: string;
        status: string;
        sequence_number: number;
        plain_text?: string;
        content_blocks: Array<Record<string, string>>;
        created_at?: number;
        updated_at?: number;
      },
      string
    >(appendMessage)(ctx as never, {
      thread_id: threadId,
      external_id: "msg_user_streaming",
      role: "user",
      status: "complete",
      sequence_number: 1,
      plain_text: "Show attendance",
      content_blocks: [{ kind: "text", text: "Show attendance" }],
      created_at: 115,
      updated_at: 115,
    });

    // 2. Streaming placeholder (empty text, status=streaming)
    await getHandler<
      {
        thread_id: string;
        run_id?: string;
        external_id: string;
        role: string;
        status: string;
        sequence_number: number;
        plain_text?: string;
        content_blocks: Array<Record<string, string>>;
        created_at?: number;
        updated_at?: number;
      },
      string
    >(appendMessage)(ctx as never, {
      thread_id: threadId,
      run_id: runId,
      external_id: "msg_assistant_streaming",
      role: "assistant",
      status: "streaming",
      sequence_number: 2,
      plain_text: "",
      content_blocks: [{ kind: "text", text: "" }],
      created_at: 120,
      updated_at: 120,
    });

    // 3. First streaming delta patch (same external_id)
    await getHandler<
      {
        thread_id: string;
        run_id?: string;
        external_id: string;
        role: string;
        status: string;
        sequence_number: number;
        plain_text?: string;
        content_blocks: Array<Record<string, string>>;
        created_at?: number;
        updated_at?: number;
      },
      string
    >(appendMessage)(ctx as never, {
      thread_id: threadId,
      run_id: runId,
      external_id: "msg_assistant_streaming",
      role: "assistant",
      status: "streaming",
      sequence_number: 2,
      plain_text: "Partial text",
      content_blocks: [{ kind: "text", text: "Partial text" }],
      updated_at: 125,
    });

    // 4. Second streaming delta patch (same external_id)
    await getHandler<
      {
        thread_id: string;
        run_id?: string;
        external_id: string;
        role: string;
        status: string;
        sequence_number: number;
        plain_text?: string;
        content_blocks: Array<Record<string, string>>;
        created_at?: number;
        updated_at?: number;
      },
      string
    >(appendMessage)(ctx as never, {
      thread_id: threadId,
      run_id: runId,
      external_id: "msg_assistant_streaming",
      role: "assistant",
      status: "streaming",
      sequence_number: 2,
      plain_text: "Partial text extended",
      content_blocks: [{ kind: "text", text: "Partial text extended" }],
      updated_at: 130,
    });

    // 5. Finalization patch (same external_id, status=complete)
    await getHandler<
      {
        thread_id: string;
        run_id?: string;
        external_id: string;
        role: string;
        status: string;
        sequence_number: number;
        plain_text?: string;
        content_blocks: Array<Record<string, string>>;
        created_at?: number;
        updated_at?: number;
      },
      string
    >(appendMessage)(ctx as never, {
      thread_id: threadId,
      run_id: runId,
      external_id: "msg_assistant_streaming",
      role: "assistant",
      status: "complete",
      sequence_number: 2,
      plain_text: "Full answer ready",
      content_blocks: [{ kind: "markdown", text: "Full answer ready" }],
      updated_at: 135,
    });

    // Assertions: only one assistant message row should exist
    const messageRows = db.rows("agent_messages");
    const assistantRows = messageRows.filter(
      (row) => row.role === "assistant" && row.thread_id === threadId
    );
    expect(assistantRows).toHaveLength(1);
    expect(assistantRows[0]).toMatchObject({
      external_id: "msg_assistant_streaming",
      status: "complete",
      plain_text: "Full answer ready",
      sequence_number: 2,
    });

    // Total messages: 1 user + 1 assistant = 2
    const threadMessages = messageRows.filter((row) => row.thread_id === threadId);
    expect(threadMessages).toHaveLength(2);

    // Sequence ordering preserved via getThreadState
    const threadState = await getHandler<
      { external_id?: string; thread_id?: string },
      {
        thread: Record<string, unknown>;
        runs: Array<Record<string, unknown>>;
        messages: Array<Record<string, unknown>>;
        artifacts: Array<Record<string, unknown>>;
        approvals: Array<Record<string, unknown>>;
        context_links: Array<Record<string, unknown>>;
      }
    >(getThreadState)(ctx as never, { external_id: "thread_streaming_1" });

    expect(threadState.messages).toHaveLength(2);
    expect(threadState.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(threadState.messages.map((m) => m.sequence_number)).toEqual([1, 2]);
    expect(threadState.messages[1]).toMatchObject({
      status: "complete",
      plain_text: "Full answer ready",
    });
  });

  test("getThreadState returns both streaming-upserted message and ordered traces together", async () => {
    const { ctx, db } = createHarness();

    // 1. Create thread
    const threadId = await getHandler<
      { external_id: string; channel: string; status: string; title?: string; updated_at?: number },
      string
    >(upsertThread)(ctx as never, {
      external_id: "thread_combined_1",
      channel: "web",
      status: "active",
      title: "Combined test",
      updated_at: 100,
    });

    // 2. Create run
    const runId = await getHandler<
      { thread_id: string; external_id: string; status: string; trigger_source: string; updated_at?: number },
      string
    >(upsertRun)(ctx as never, {
      thread_id: threadId,
      external_id: "run_combined_1",
      status: "running",
      trigger_source: "web",
      updated_at: 110,
    });

    // 3. User message
    await getHandler<
      {
        thread_id: string;
        external_id: string;
        role: string;
        status: string;
        sequence_number: number;
        plain_text?: string;
        content_blocks: Array<Record<string, string>>;
        created_at?: number;
        updated_at?: number;
      },
      string
    >(appendMessage)(ctx as never, {
      thread_id: threadId,
      external_id: "msg_user_combined",
      role: "user",
      status: "complete",
      sequence_number: 1,
      plain_text: "How is attendance?",
      content_blocks: [{ kind: "text", text: "How is attendance?" }],
      created_at: 115,
      updated_at: 115,
    });

    // 4. Planning trace
    await getHandler<
      {
        thread_id: string;
        run_id: string;
        external_id: string;
        kind: string;
        sequence_number: number;
        summary: string;
        status: string;
        created_at?: number;
        updated_at?: number;
      },
      string
    >(appendTrace)(ctx as never, {
      thread_id: threadId,
      run_id: runId,
      external_id: "trace_combined_planning",
      kind: "planning",
      sequence_number: 1,
      summary: "Analyzing request.",
      status: "completed",
      created_at: 116,
      updated_at: 116,
    });

    // 5. Streaming assistant placeholder
    await getHandler<
      {
        thread_id: string;
        run_id?: string;
        external_id: string;
        role: string;
        status: string;
        sequence_number: number;
        plain_text?: string;
        content_blocks: Array<Record<string, string>>;
        created_at?: number;
        updated_at?: number;
      },
      string
    >(appendMessage)(ctx as never, {
      thread_id: threadId,
      run_id: runId,
      external_id: "msg_assistant_combined",
      role: "assistant",
      status: "streaming",
      sequence_number: 2,
      plain_text: "",
      content_blocks: [{ kind: "text", text: "" }],
      created_at: 120,
      updated_at: 120,
    });

    // 6. Thinking trace (emitted during streaming)
    await getHandler<
      {
        thread_id: string;
        run_id: string;
        external_id: string;
        kind: string;
        sequence_number: number;
        summary: string;
        status: string;
        created_at?: number;
        updated_at?: number;
      },
      string
    >(appendTrace)(ctx as never, {
      thread_id: threadId,
      run_id: runId,
      external_id: "trace_combined_thinking",
      kind: "thinking",
      sequence_number: 2,
      summary: "Generating response.",
      status: "completed",
      created_at: 121,
      updated_at: 121,
    });

    // 7. Streaming delta patch
    await getHandler<
      {
        thread_id: string;
        run_id?: string;
        external_id: string;
        role: string;
        status: string;
        sequence_number: number;
        plain_text?: string;
        content_blocks: Array<Record<string, string>>;
        updated_at?: number;
      },
      string
    >(appendMessage)(ctx as never, {
      thread_id: threadId,
      run_id: runId,
      external_id: "msg_assistant_combined",
      role: "assistant",
      status: "streaming",
      sequence_number: 2,
      plain_text: "Partial answer",
      content_blocks: [{ kind: "text", text: "Partial answer" }],
      updated_at: 125,
    });

    // 8. Artifact generation trace
    await getHandler<
      {
        thread_id: string;
        run_id: string;
        external_id: string;
        kind: string;
        sequence_number: number;
        summary: string;
        detail_json?: string;
        status: string;
        created_at?: number;
        updated_at?: number;
      },
      string
    >(appendTrace)(ctx as never, {
      thread_id: threadId,
      run_id: runId,
      external_id: "trace_combined_artifact",
      kind: "artifact_generation",
      sequence_number: 3,
      summary: "Generated artifact: Run Summary",
      detail_json: '{"artifact_id":"art_1","kind":"report"}',
      status: "completed",
      created_at: 128,
      updated_at: 128,
    });

    // 9. Finalization patch (same external_id, status=complete)
    await getHandler<
      {
        thread_id: string;
        run_id?: string;
        external_id: string;
        role: string;
        status: string;
        sequence_number: number;
        plain_text?: string;
        content_blocks: Array<Record<string, string>>;
        updated_at?: number;
      },
      string
    >(appendMessage)(ctx as never, {
      thread_id: threadId,
      run_id: runId,
      external_id: "msg_assistant_combined",
      role: "assistant",
      status: "complete",
      sequence_number: 2,
      plain_text: "Full answer ready",
      content_blocks: [{ kind: "markdown", text: "Full answer ready" }],
      updated_at: 130,
    });

    // 10. Run completed trace
    await getHandler<
      {
        thread_id: string;
        run_id: string;
        external_id: string;
        kind: string;
        sequence_number: number;
        summary: string;
        status: string;
        created_at?: number;
        updated_at?: number;
      },
      string
    >(appendTrace)(ctx as never, {
      thread_id: threadId,
      run_id: runId,
      external_id: "trace_combined_completed",
      kind: "run_completed",
      sequence_number: 4,
      summary: "Run completed successfully.",
      status: "completed",
      created_at: 135,
      updated_at: 135,
    });

    // 11. Mark run completed
    await getHandler<
      { thread_id: string; external_id: string; status: string; trigger_source: string; completed_at?: number; updated_at?: number },
      string
    >(upsertRun)(ctx as never, {
      thread_id: threadId,
      external_id: "run_combined_1",
      status: "completed",
      trigger_source: "web",
      completed_at: 140,
      updated_at: 140,
    });

    // ---- Assertions: getThreadState returns both messages and traces ----
    const threadState = await getHandler<
      { external_id?: string; thread_id?: string },
      {
        thread: Record<string, unknown>;
        runs: Array<Record<string, unknown>>;
        messages: Array<Record<string, unknown>>;
        traces: Array<Record<string, unknown>>;
      }
    >(getThreadState)(ctx as never, { external_id: "thread_combined_1" });

    // Messages: exactly 2 (user + single upserted assistant)
    expect(threadState.messages).toHaveLength(2);
    expect(threadState.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(threadState.messages.map((m) => m.sequence_number)).toEqual([1, 2]);
    expect(threadState.messages[1]).toMatchObject({
      external_id: "msg_assistant_combined",
      status: "complete",
      plain_text: "Full answer ready",
    });

    // Traces: 4 traces in correct order
    expect(threadState.traces).toHaveLength(4);
    expect(threadState.traces.map((t) => t.kind)).toEqual([
      "planning",
      "thinking",
      "artifact_generation",
      "run_completed",
    ]);
    expect(threadState.traces.map((t) => t.sequence_number)).toEqual([1, 2, 3, 4]);

    // Run is completed
    expect(threadState.runs).toHaveLength(1);
    expect(threadState.runs[0]).toMatchObject({ status: "completed" });

    // Raw DB: only 1 assistant message row (not duplicated by streaming patches)
    const assistantRows = db.rows("agent_messages").filter(
      (row) => row.role === "assistant" && row.thread_id === threadId
    );
    expect(assistantRows).toHaveLength(1);
  });
});
