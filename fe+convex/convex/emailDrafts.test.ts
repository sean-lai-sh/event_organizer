import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

type TableName = "agent_email_drafts";
type TableRow = { _id: string } & Record<string, unknown>;
type Tables = Record<TableName, TableRow[]>;

let requireAdminMemberImpl = async () => ({
  authUser: { _id: "user:1" },
  member: { role: "admin" },
});

mock.module("./eboard", () => ({
  requireAdminMember: (...args: unknown[]) => requireAdminMemberImpl(...args),
  requireAdminOrAgent: async (ctx: unknown, agentToken: string | undefined) => {
    const expected = process.env.AGENT_SERVICE_TOKEN;
    if (expected && agentToken && agentToken === expected) {
      return { authUser: null, member: null, isAgent: true } as const;
    }
    const result = await requireAdminMemberImpl();
    return { ...result, isAgent: false } as const;
  },
}));

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

  withIndex(_indexName: string, build: (b: FakeIndexRangeBuilder) => unknown) {
    const builder = new FakeIndexRangeBuilder();
    build(builder);
    return new FakeQuery(this.rows, builder.filters);
  }

  async unique() {
    const matches = this.rows.filter((row) =>
      this.filters.every(([field, value]) => row[field] === value)
    );
    if (matches.length > 1) throw new Error("Expected unique row, got multiple");
    return matches[0] ?? null;
  }

  async collect() {
    return this.rows.filter((row) =>
      this.filters.every(([field, value]) => row[field] === value)
    );
  }
}

class FakeDb {
  private counter = 0;
  readonly tables: Tables = { agent_email_drafts: [] };

  query(table: TableName) {
    return new FakeQuery(this.tables[table]);
  }

  async get(id: string) {
    const table = id.split(":")[0] as TableName;
    return this.tables[table].find((row) => row._id === id) ?? null;
  }

  async insert(table: TableName, value: Record<string, unknown>) {
    const id = `${table}:${++this.counter}`;
    this.tables[table].push({ _id: id, ...value });
    return id;
  }

  async patch(id: string, value: Record<string, unknown>) {
    const table = id.split(":")[0] as TableName;
    const index = this.tables[table].findIndex((row) => row._id === id);
    if (index === -1) throw new Error(`Missing row: ${id}`);
    this.tables[table][index] = { ...this.tables[table][index], ...value };
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
  if (!handler) throw new Error("Convex handler unavailable in test harness");
  return handler;
}

function installConvexHandlerAliases(functions: unknown[]) {
  for (const fn of functions) {
    const wrapped = fn as { handler?: unknown; _handler?: unknown };
    if (!wrapped.handler) wrapped.handler = wrapped._handler;
  }
}

function createHarness() {
  const db = new FakeDb();
  return { db, ctx: { db } };
}

const draftsModulePromise = import("./emailDrafts");

const baseDraftArgs = {
  external_id: "draft_xyz",
  thread_id: "agent_threads:1",
  to_name: "Jane Doe",
  to_email: "jane@example.com",
  subject: "Speaking at Fintech 2026",
  body: "Hi Jane, …",
};

beforeAll(async () => {
  const mod = await draftsModulePromise;
  installConvexHandlerAliases([
    mod.createDraft,
    mod.getDraftByExternalId,
    mod.updateDraftFields,
    mod.markSending,
    mod.markSent,
    mod.markFailed,
    mod.markDiscarded,
  ]);
});

beforeEach(() => {
  requireAdminMemberImpl = async () => ({
    authUser: { _id: "user:1" },
    member: { role: "admin" },
  });
});

describe("emailDrafts", () => {
  test("createDraft requires admin/agent and inserts a draft row", async () => {
    const { createDraft } = await draftsModulePromise;
    const { db, ctx } = createHarness();

    requireAdminMemberImpl = async () => {
      throw new Error("Admin access required");
    };
    await expect(
      getHandler<typeof baseDraftArgs, string>(createDraft)(ctx as never, baseDraftArgs)
    ).rejects.toThrow("Admin access required");

    requireAdminMemberImpl = async () => ({
      authUser: { _id: "user:1" },
      member: { role: "admin" },
    });
    const id = await getHandler<typeof baseDraftArgs, string>(createDraft)(
      ctx as never,
      baseDraftArgs
    );
    expect(await db.get(id)).toMatchObject({
      external_id: "draft_xyz",
      status: "draft",
      to_name: "Jane Doe",
      to_email: "jane@example.com",
      subject: "Speaking at Fintech 2026",
    });
  });

  test("createDraft is idempotent on repeated external_id", async () => {
    const { createDraft } = await draftsModulePromise;
    const { db, ctx } = createHarness();

    const first = await getHandler<typeof baseDraftArgs, string>(createDraft)(
      ctx as never,
      baseDraftArgs
    );
    const second = await getHandler<typeof baseDraftArgs, string>(createDraft)(
      ctx as never,
      { ...baseDraftArgs, subject: "Different subject" }
    );
    expect(first).toBe(second);
    expect(db.rows("agent_email_drafts")).toHaveLength(1);
    // Original subject preserved — subsequent create attempts don't overwrite.
    expect(db.rows("agent_email_drafts")[0].subject).toBe("Speaking at Fintech 2026");
  });

  test("updateDraftFields patches editable fields while status=draft", async () => {
    const { createDraft, updateDraftFields, getDraftByExternalId } = await draftsModulePromise;
    const { ctx } = createHarness();

    await getHandler<typeof baseDraftArgs, string>(createDraft)(ctx as never, baseDraftArgs);

    await getHandler<
      {
        external_id: string;
        subject?: string;
        body?: string;
      },
      string
    >(updateDraftFields)(ctx as never, {
      external_id: "draft_xyz",
      subject: "Updated subject",
      body: "Updated body",
    });

    const after = await getHandler<{ external_id: string }, unknown>(getDraftByExternalId)(
      ctx as never,
      { external_id: "draft_xyz" }
    );
    expect(after).toMatchObject({
      subject: "Updated subject",
      body: "Updated body",
      to_email: "jane@example.com", // untouched
    });
  });

  test("updateDraftFields rejects edits after the draft has moved past 'draft'", async () => {
    const { createDraft, updateDraftFields, markSending } = await draftsModulePromise;
    const { ctx } = createHarness();

    await getHandler<typeof baseDraftArgs, string>(createDraft)(ctx as never, baseDraftArgs);
    await getHandler<{ external_id: string }, string>(markSending)(ctx as never, {
      external_id: "draft_xyz",
    });

    await expect(
      getHandler<
        { external_id: string; subject?: string },
        string
      >(updateDraftFields)(ctx as never, {
        external_id: "draft_xyz",
        subject: "Too late",
      })
    ).rejects.toThrow(/cannot be edited/);
  });

  test("markSending → markSent flips status, sets agentmail_message_id and sent_at", async () => {
    const { createDraft, markSending, markSent } = await draftsModulePromise;
    const { db, ctx } = createHarness();

    await getHandler<typeof baseDraftArgs, string>(createDraft)(ctx as never, baseDraftArgs);
    await getHandler<{ external_id: string; sent_by_user_id?: string }, string>(markSending)(
      ctx as never,
      { external_id: "draft_xyz", sent_by_user_id: "user:7" }
    );
    expect(db.rows("agent_email_drafts")[0]).toMatchObject({
      status: "sending",
      sent_by_user_id: "user:7",
    });

    await getHandler<
      { external_id: string; agentmail_message_id: string; sent_at?: number },
      string
    >(markSent)(ctx as never, {
      external_id: "draft_xyz",
      agentmail_message_id: "am_msg_42",
      sent_at: 12345,
    });
    expect(db.rows("agent_email_drafts")[0]).toMatchObject({
      status: "sent",
      agentmail_message_id: "am_msg_42",
      sent_at: 12345,
    });
  });

  test("markFailed records error_message and leaves draft sendable for follow-ups", async () => {
    const { createDraft, markSending, markFailed } = await draftsModulePromise;
    const { db, ctx } = createHarness();

    await getHandler<typeof baseDraftArgs, string>(createDraft)(ctx as never, baseDraftArgs);
    await getHandler<{ external_id: string }, string>(markSending)(ctx as never, {
      external_id: "draft_xyz",
    });
    await getHandler<{ external_id: string; error_message: string }, string>(markFailed)(
      ctx as never,
      { external_id: "draft_xyz", error_message: "AgentMail 503" }
    );
    expect(db.rows("agent_email_drafts")[0]).toMatchObject({
      status: "failed",
      error_message: "AgentMail 503",
    });
  });

  test("markSending refuses to re-send a terminal draft", async () => {
    const { createDraft, markSending, markSent } = await draftsModulePromise;
    const { ctx } = createHarness();

    await getHandler<typeof baseDraftArgs, string>(createDraft)(ctx as never, baseDraftArgs);
    await getHandler<{ external_id: string }, string>(markSending)(ctx as never, {
      external_id: "draft_xyz",
    });
    await getHandler<
      { external_id: string; agentmail_message_id: string },
      string
    >(markSent)(ctx as never, {
      external_id: "draft_xyz",
      agentmail_message_id: "am_msg_1",
    });

    await expect(
      getHandler<{ external_id: string }, string>(markSending)(ctx as never, {
        external_id: "draft_xyz",
      })
    ).rejects.toThrow(/already finalized/);
  });

  test("markDiscarded refuses to discard a sent draft", async () => {
    const { createDraft, markSending, markSent, markDiscarded } = await draftsModulePromise;
    const { ctx } = createHarness();

    await getHandler<typeof baseDraftArgs, string>(createDraft)(ctx as never, baseDraftArgs);
    await getHandler<{ external_id: string }, string>(markSending)(ctx as never, {
      external_id: "draft_xyz",
    });
    await getHandler<
      { external_id: string; agentmail_message_id: string },
      string
    >(markSent)(ctx as never, {
      external_id: "draft_xyz",
      agentmail_message_id: "am_msg_1",
    });

    await expect(
      getHandler<{ external_id: string }, string>(markDiscarded)(ctx as never, {
        external_id: "draft_xyz",
      })
    ).rejects.toThrow(/already finalized/);
  });

  test("markDiscarded transitions an unsent draft", async () => {
    const { createDraft, markDiscarded } = await draftsModulePromise;
    const { db, ctx } = createHarness();

    await getHandler<typeof baseDraftArgs, string>(createDraft)(ctx as never, baseDraftArgs);
    await getHandler<{ external_id: string }, string>(markDiscarded)(ctx as never, {
      external_id: "draft_xyz",
    });
    expect(db.rows("agent_email_drafts")[0]).toMatchObject({ status: "discarded" });
  });

  test("agent token bypasses admin gate", async () => {
    process.env.AGENT_SERVICE_TOKEN = "token-abc";
    requireAdminMemberImpl = async () => {
      throw new Error("Admin access required");
    };

    const { createDraft } = await draftsModulePromise;
    const { db, ctx } = createHarness();

    const id = await getHandler<typeof baseDraftArgs & { _agent_token?: string }, string>(
      createDraft
    )(ctx as never, { ...baseDraftArgs, _agent_token: "token-abc" });
    expect(await db.get(id)).toMatchObject({ status: "draft" });

    delete process.env.AGENT_SERVICE_TOKEN;
  });

  test("getDraftByExternalId returns null for missing drafts", async () => {
    const { getDraftByExternalId } = await draftsModulePromise;
    const { ctx } = createHarness();
    const result = await getHandler<{ external_id: string }, unknown>(getDraftByExternalId)(
      ctx as never,
      { external_id: "draft_missing" }
    );
    expect(result).toBeNull();
  });
});
