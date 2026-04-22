/**
 * Tests for the agent_traces Convex persistence layer (Issue #20).
 *
 * Success States:
 *   - appendTrace inserts a new trace row with correct fields.
 *   - appendTrace upserts (patches) when called with the same external_id.
 *   - getThreadState returns traces sorted by sequence_number ascending.
 *   - getRunState returns only traces belonging to that run.
 *   - Trace rows have no raw provider payloads.
 *
 * Failure States:
 *   - Missing trace rows after appendTrace indicates a persistence bug.
 *   - Traces returned out of sequence_number order indicates a sorting bug.
 *   - Duplicate external_ids after upsert indicates idempotency is broken.
 */

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

describe("agent trace persistence", () => {
  test("appendTrace inserts a new trace row", async () => {
    const { ctx, db } = createHarness();

    // Create prerequisite thread and run
    const threadId = await getHandler<
      { external_id: string; channel: string; status: string; updated_at?: number },
      string
    >(upsertThread)(ctx as never, {
      external_id: "thread_trace_1",
      channel: "web",
      status: "active",
      updated_at: 100,
    });

    const runId = await getHandler<
      { thread_id: string; external_id: string; status: string; trigger_source: string; updated_at?: number },
      string
    >(upsertRun)(ctx as never, {
      thread_id: threadId,
      external_id: "run_trace_1",
      status: "running",
      trigger_source: "web",
      updated_at: 110,
    });

    // Insert trace
    const traceId = await getHandler<
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
      external_id: "trace_planning_1",
      kind: "planning",
      sequence_number: 1,
      summary: "Analyzing request and planning execution strategy.",
      detail_json: undefined,
      status: "completed",
      created_at: 115,
      updated_at: 115,
    });

    expect(traceId).toBeTruthy();
    expect(db.rows("agent_traces")).toHaveLength(1);
    expect(db.rows("agent_traces")[0]).toMatchObject({
      external_id: "trace_planning_1",
      kind: "planning",
      sequence_number: 1,
      summary: "Analyzing request and planning execution strategy.",
      status: "completed",
    });
  });

  test("appendTrace upserts on same external_id", async () => {
    const { ctx, db } = createHarness();

    const threadId = await getHandler<
      { external_id: string; channel: string; status: string; updated_at?: number },
      string
    >(upsertThread)(ctx as never, {
      external_id: "thread_upsert",
      channel: "web",
      status: "active",
      updated_at: 100,
    });

    const runId = await getHandler<
      { thread_id: string; external_id: string; status: string; trigger_source: string; updated_at?: number },
      string
    >(upsertRun)(ctx as never, {
      thread_id: threadId,
      external_id: "run_upsert",
      status: "running",
      trigger_source: "web",
      updated_at: 110,
    });

    await getHandler<
      {
        thread_id: string;
        run_id: string;
        external_id: string;
        kind: string;
        sequence_number: number;
        summary: string;
        status: string;
        updated_at?: number;
      },
      string
    >(appendTrace)(ctx as never, {
      thread_id: threadId,
      run_id: runId,
      external_id: "trace_upsert_1",
      kind: "approval_pause",
      sequence_number: 1,
      summary: "Waiting for approval",
      status: "waiting",
      updated_at: 120,
    });

    await getHandler<
      {
        thread_id: string;
        run_id: string;
        external_id: string;
        kind: string;
        sequence_number: number;
        summary: string;
        status: string;
        updated_at?: number;
      },
      string
    >(appendTrace)(ctx as never, {
      thread_id: threadId,
      run_id: runId,
      external_id: "trace_upsert_1",
      kind: "approval_pause",
      sequence_number: 1,
      summary: "Waiting for approval (updated)",
      status: "completed",
      updated_at: 130,
    });

    expect(db.rows("agent_traces")).toHaveLength(1);
    expect(db.rows("agent_traces")[0]).toMatchObject({
      summary: "Waiting for approval (updated)",
      status: "completed",
    });
  });

  test("getThreadState includes traces sorted by sequence_number", async () => {
    const { ctx } = createHarness();

    const threadId = await getHandler<
      { external_id: string; channel: string; status: string; updated_at?: number },
      string
    >(upsertThread)(ctx as never, {
      external_id: "thread_state_traces",
      channel: "web",
      status: "active",
      updated_at: 100,
    });

    const runId = await getHandler<
      { thread_id: string; external_id: string; status: string; trigger_source: string; updated_at?: number },
      string
    >(upsertRun)(ctx as never, {
      thread_id: threadId,
      external_id: "run_state_traces",
      status: "completed",
      trigger_source: "web",
      updated_at: 200,
    });

    // Insert traces out of order
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
      external_id: "trace_3",
      kind: "run_completed",
      sequence_number: 3,
      summary: "Run completed",
      status: "completed",
      created_at: 160,
      updated_at: 160,
    });

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
      external_id: "trace_1",
      kind: "planning",
      sequence_number: 1,
      summary: "Planning",
      status: "completed",
      created_at: 120,
      updated_at: 120,
    });

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
      external_id: "trace_2",
      kind: "tool_completion",
      sequence_number: 2,
      summary: "Tool completed",
      detail_json: '{"tool":"list_events"}',
      status: "completed",
      created_at: 140,
      updated_at: 140,
    });

    const threadState = await getHandler<
      { external_id?: string; thread_id?: string },
      {
        thread: Record<string, unknown>;
        traces: Array<Record<string, unknown>>;
      }
    >(getThreadState)(ctx as never, { external_id: "thread_state_traces" });

    expect(threadState.traces).toHaveLength(3);
    expect(threadState.traces.map((t) => t.sequence_number)).toEqual([1, 2, 3]);
    expect(threadState.traces.map((t) => t.kind)).toEqual([
      "planning",
      "tool_completion",
      "run_completed",
    ]);
  });

  test("getRunState includes only traces for that run", async () => {
    const { ctx } = createHarness();

    const threadId = await getHandler<
      { external_id: string; channel: string; status: string; updated_at?: number },
      string
    >(upsertThread)(ctx as never, {
      external_id: "thread_run_filter",
      channel: "web",
      status: "active",
      updated_at: 100,
    });

    const run1Id = await getHandler<
      { thread_id: string; external_id: string; status: string; trigger_source: string; updated_at?: number },
      string
    >(upsertRun)(ctx as never, {
      thread_id: threadId,
      external_id: "run_filter_1",
      status: "completed",
      trigger_source: "web",
      updated_at: 200,
    });

    const run2Id = await getHandler<
      { thread_id: string; external_id: string; status: string; trigger_source: string; updated_at?: number },
      string
    >(upsertRun)(ctx as never, {
      thread_id: threadId,
      external_id: "run_filter_2",
      status: "completed",
      trigger_source: "web",
      updated_at: 300,
    });

    await getHandler<
      {
        thread_id: string;
        run_id: string;
        external_id: string;
        kind: string;
        sequence_number: number;
        summary: string;
        status: string;
        updated_at?: number;
      },
      string
    >(appendTrace)(ctx as never, {
      thread_id: threadId,
      run_id: run1Id,
      external_id: "trace_r1",
      kind: "planning",
      sequence_number: 1,
      summary: "Run 1 planning",
      status: "completed",
      updated_at: 150,
    });

    await getHandler<
      {
        thread_id: string;
        run_id: string;
        external_id: string;
        kind: string;
        sequence_number: number;
        summary: string;
        status: string;
        updated_at?: number;
      },
      string
    >(appendTrace)(ctx as never, {
      thread_id: threadId,
      run_id: run2Id,
      external_id: "trace_r2",
      kind: "thinking",
      sequence_number: 1,
      summary: "Run 2 thinking",
      status: "completed",
      updated_at: 250,
    });

    const runState = await getHandler<
      { external_id?: string; run_id?: string },
      {
        run: Record<string, unknown>;
        traces: Array<Record<string, unknown>>;
      }
    >(getRunState)(ctx as never, { external_id: "run_filter_1" });

    expect(runState.traces).toHaveLength(1);
    expect(runState.traces[0].external_id).toBe("trace_r1");
  });

  test("trace rows contain no raw provider payloads", async () => {
    const { ctx, db } = createHarness();

    const threadId = await getHandler<
      { external_id: string; channel: string; status: string; updated_at?: number },
      string
    >(upsertThread)(ctx as never, {
      external_id: "thread_no_leak",
      channel: "web",
      status: "active",
      updated_at: 100,
    });

    const runId = await getHandler<
      { thread_id: string; external_id: string; status: string; trigger_source: string; updated_at?: number },
      string
    >(upsertRun)(ctx as never, {
      thread_id: threadId,
      external_id: "run_no_leak",
      status: "completed",
      trigger_source: "web",
      updated_at: 200,
    });

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
        updated_at?: number;
      },
      string
    >(appendTrace)(ctx as never, {
      thread_id: threadId,
      run_id: runId,
      external_id: "trace_no_leak",
      kind: "tool_completion",
      sequence_number: 1,
      summary: "Tool list_events completed.",
      detail_json: '{"tool":"list_events","result":[]}',
      status: "completed",
      updated_at: 150,
    });

    const rows = db.rows("agent_traces");
    for (const row of rows) {
      const serialized = JSON.stringify(row);
      expect(serialized).not.toContain("provider_event");
      expect(serialized.toLowerCase()).not.toContain("anthropic");
    }
  });
});
