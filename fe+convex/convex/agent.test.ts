/**
 * Tests for thread rename and delete mutations (convex/agent.ts).
 *
 * These mutations are the Convex-side handlers that the Next.js API route
 * calls directly (no Modal backend required).
 *
 * Success States:
 *   - renameThread updates the title and updated_at when given external_id.
 *   - renameThread updates the title when given thread_id (Convex doc id).
 *   - renameThread rejects empty titles.
 *   - deleteThread removes the thread and all child rows when given external_id.
 *   - deleteThread removes the thread and all child rows when given id (Convex doc id).
 *   - deleteThread is idempotent — calling with a non-existent id throws "Thread not found".
 *
 * Failure States:
 *   - renameThread with neither thread_id nor external_id throws "Thread not found".
 *   - renameThread with an empty title throws "Thread title cannot be empty".
 *   - deleteThread with a non-existent external_id throws "Thread not found".
 */

import { describe, expect, test } from "bun:test";

import { deleteThread, renameThread } from "./agent";

type TableName =
  | "agent_threads"
  | "agent_runs"
  | "agent_messages"
  | "agent_artifacts"
  | "agent_approvals"
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
    agent_context_links: 0,
  };

  readonly tables: Tables = {
    agent_threads: [],
    agent_runs: [],
    agent_messages: [],
    agent_artifacts: [],
    agent_approvals: [],
    agent_context_links: [],
  };

  query(table: TableName) {
    return new FakeQuery(this.tables[table]);
  }

  async get(id: string) {
    for (const table of Object.values(this.tables)) {
      const row = table.find((r) => r._id === id);
      if (row) return row;
    }
    return null;
  }

  async insert(table: TableName, value: Record<string, unknown>) {
    const id = `${table}:${++this.counters[table]}`;
    this.tables[table].push({ _id: id, ...value });
    return id;
  }

  async patch(id: string, value: Record<string, unknown>) {
    for (const table of Object.values(this.tables)) {
      const index = table.findIndex((r) => r._id === id);
      if (index !== -1) {
        table[index] = { ...table[index], ...value };
        return;
      }
    }
    throw new Error(`Missing row: ${id}`);
  }

  async delete(id: string) {
    for (const [, table] of Object.entries(this.tables)) {
      const index = table.findIndex((r) => r._id === id);
      if (index !== -1) {
        table.splice(index, 1);
        return;
      }
    }
    throw new Error(`Missing row: ${id}`);
  }

  rows(table: TableName) {
    return [...this.tables[table]];
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

function installHandlerAliases() {
  for (const fn of [renameThread, deleteThread]) {
    const wrapped = fn as typeof fn & { handler?: unknown; _handler?: unknown };
    if (!wrapped.handler) {
      wrapped.handler = wrapped._handler;
    }
  }
}

async function seedThread(db: FakeDb, externalId: string, title: string) {
  return await db.insert("agent_threads", {
    external_id: externalId,
    channel: "web",
    status: "active",
    title,
    created_at: 100,
    updated_at: 100,
  });
}

async function seedChildRows(db: FakeDb, threadId: string) {
  await db.insert("agent_messages", {
    thread_id: threadId,
    external_id: "msg_1",
    role: "user",
    status: "delivered",
    sequence_number: 1,
    content_blocks: [],
    created_at: 110,
    updated_at: 110,
  });
  await db.insert("agent_runs", {
    thread_id: threadId,
    external_id: "run_1",
    status: "completed",
    trigger_source: "web",
    started_at: 110,
    updated_at: 120,
  });
  await db.insert("agent_artifacts", {
    thread_id: threadId,
    external_id: "art_1",
    kind: "report",
    status: "ready",
    sort_order: 1,
    content_blocks: [],
    created_at: 115,
    updated_at: 115,
  });
  await db.insert("agent_approvals", {
    thread_id: threadId,
    run_id: "agent_runs:1",
    external_id: "appr_1",
    status: "pending",
    action_type: "send_email",
    title: "Send email",
    risk_level: "medium",
    requested_at: 116,
    updated_at: 116,
  });
  await db.insert("agent_context_links", {
    thread_id: threadId,
    link_key: "link_1",
    relation: "about",
    entity_type: "event",
    entity_id: "evt_1",
    created_at: 117,
    updated_at: 117,
  });
}

describe("renameThread", () => {
  test("renames thread by external_id", async () => {
    installHandlerAliases();
    const db = new FakeDb();
    const ctx = { db };
    await seedThread(db, "thread_rename_1", "Old Title");

    await getHandler<
      { external_id?: string; title: string },
      string
    >(renameThread)(ctx as never, {
      external_id: "thread_rename_1",
      title: "New Title",
    });

    const thread = db.rows("agent_threads")[0];
    expect(thread.title).toBe("New Title");
    expect(thread.updated_at).toBeGreaterThan(100);
  });

  test("renames thread by thread_id (Convex doc id)", async () => {
    installHandlerAliases();
    const db = new FakeDb();
    const ctx = { db };
    const threadId = await seedThread(db, "thread_rename_2", "Old Title");

    await getHandler<
      { thread_id?: string; title: string },
      string
    >(renameThread)(ctx as never, {
      thread_id: threadId,
      title: "Updated Title",
    });

    const thread = db.rows("agent_threads")[0];
    expect(thread.title).toBe("Updated Title");
  });

  test("rejects empty title", async () => {
    installHandlerAliases();
    const db = new FakeDb();
    const ctx = { db };
    await seedThread(db, "thread_rename_3", "Existing Title");

    await expect(
      getHandler<{ external_id?: string; title: string }, string>(renameThread)(
        ctx as never,
        { external_id: "thread_rename_3", title: "   " }
      )
    ).rejects.toThrow("Thread title cannot be empty");
  });

  test("throws when thread not found", async () => {
    installHandlerAliases();
    const db = new FakeDb();
    const ctx = { db };

    await expect(
      getHandler<{ external_id?: string; title: string }, string>(renameThread)(
        ctx as never,
        { external_id: "nonexistent", title: "Test" }
      )
    ).rejects.toThrow("Thread not found");
  });
});

describe("deleteThread", () => {
  test("deletes thread and all child rows by external_id", async () => {
    installHandlerAliases();
    const db = new FakeDb();
    const ctx = { db };
    const threadId = await seedThread(db, "thread_delete_1", "To Delete");
    await seedChildRows(db, threadId);

    // Verify child rows exist
    expect(db.rows("agent_messages")).toHaveLength(1);
    expect(db.rows("agent_runs")).toHaveLength(1);
    expect(db.rows("agent_artifacts")).toHaveLength(1);
    expect(db.rows("agent_approvals")).toHaveLength(1);
    expect(db.rows("agent_context_links")).toHaveLength(1);

    await getHandler<
      { external_id?: string },
      string
    >(deleteThread)(ctx as never, {
      external_id: "thread_delete_1",
    });

    // All rows should be gone
    expect(db.rows("agent_threads")).toHaveLength(0);
    expect(db.rows("agent_messages")).toHaveLength(0);
    expect(db.rows("agent_runs")).toHaveLength(0);
    expect(db.rows("agent_artifacts")).toHaveLength(0);
    expect(db.rows("agent_approvals")).toHaveLength(0);
    expect(db.rows("agent_context_links")).toHaveLength(0);
  });

  test("deletes thread by Convex doc id", async () => {
    installHandlerAliases();
    const db = new FakeDb();
    const ctx = { db };
    const threadId = await seedThread(db, "thread_delete_2", "Also Delete");

    await getHandler<
      { id?: string },
      string
    >(deleteThread)(ctx as never, {
      id: threadId,
    });

    expect(db.rows("agent_threads")).toHaveLength(0);
  });

  test("throws when thread not found by external_id", async () => {
    installHandlerAliases();
    const db = new FakeDb();
    const ctx = { db };

    await expect(
      getHandler<{ external_id?: string }, string>(deleteThread)(
        ctx as never,
        { external_id: "nonexistent" }
      )
    ).rejects.toThrow("Thread not found");
  });

  test("does not delete other threads' child rows", async () => {
    installHandlerAliases();
    const db = new FakeDb();
    const ctx = { db };

    const thread1Id = await seedThread(db, "thread_keep", "Keep Me");
    await seedChildRows(db, thread1Id);

    const thread2Id = await seedThread(db, "thread_delete_3", "Delete Me");
    await db.insert("agent_messages", {
      thread_id: thread2Id,
      external_id: "msg_2",
      role: "assistant",
      status: "delivered",
      sequence_number: 1,
      content_blocks: [],
      created_at: 200,
      updated_at: 200,
    });

    await getHandler<
      { external_id?: string },
      string
    >(deleteThread)(ctx as never, {
      external_id: "thread_delete_3",
    });

    // thread_keep and its children should survive
    expect(db.rows("agent_threads")).toHaveLength(1);
    expect(db.rows("agent_threads")[0].external_id).toBe("thread_keep");
    expect(db.rows("agent_messages")).toHaveLength(1);
    expect(db.rows("agent_messages")[0].external_id).toBe("msg_1");
    expect(db.rows("agent_runs")).toHaveLength(1);
    expect(db.rows("agent_artifacts")).toHaveLength(1);
    expect(db.rows("agent_approvals")).toHaveLength(1);
    expect(db.rows("agent_context_links")).toHaveLength(1);
  });
});
