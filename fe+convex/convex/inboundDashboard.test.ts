import { describe, expect, test } from "bun:test";

import { getOutreachThread, listOutreachThreads } from "./inboundDashboard";

type TableName = "events" | "event_outreach" | "inbound_receipts";
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
  constructor(private readonly rows: TableRow[], private readonly filters: Array<[string, unknown]> = []) {}

  withIndex(_indexName: string, build: (builder: FakeIndexRangeBuilder) => unknown) {
    const builder = new FakeIndexRangeBuilder();
    build(builder);
    return new FakeQuery(this.rows, builder.filters);
  }

  order(_direction: "asc" | "desc") {
    return this;
  }

  async collect() {
    return this.rows.filter((row) => this.filters.every(([field, value]) => row[field] === value));
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
    events: 0,
    event_outreach: 0,
    inbound_receipts: 0,
  };

  readonly tables: Tables = {
    events: [],
    event_outreach: [],
    inbound_receipts: [],
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

function installConvexHandlerAliases() {
  for (const fn of [listOutreachThreads, getOutreachThread]) {
    const wrapped = fn as typeof fn & { handler?: unknown; _handler?: unknown };
    if (!wrapped.handler) {
      wrapped.handler = wrapped._handler;
    }
  }
}

function createHarness() {
  installConvexHandlerAliases();
  const db = new FakeDb();
  return { db, ctx: { db } };
}

async function seedEvent(db: FakeDb, title: string, createdAt: number) {
  return await db.insert("events", {
    title,
    description: `${title} description`,
    event_date: "2026-05-01",
    event_time: "6:00 PM",
    status: "outreach",
    needs_outreach: true,
    created_at: createdAt,
  });
}

async function seedOutreach(
  db: FakeDb,
  overrides: Record<string, unknown> = {}
) {
  const defaultEventId =
    db.tables.events[0]?._id ?? (await seedEvent(db, "Fallback Event", 1));
  return await db.insert("event_outreach", {
    event_id: defaultEventId,
    attio_record_id: "person_default",
    attio_speakers_entry_id: undefined,
    contact_name: undefined,
    contact_email: undefined,
    suggested: true,
    approved: true,
    outreach_sent: true,
    response: "pending",
    inbound_state: "needs_review",
    inbound_count: 0,
    created_at: 1,
    ...overrides,
  });
}

describe("inboundDashboard inbox queries", () => {
  test("listOutreachThreads returns all rows and filters by inbound_state", async () => {
    const { db, ctx } = createHarness();
    const summitId = await seedEvent(db, "AI Summit", 1);
    const workshopId = await seedEvent(db, "Builders Workshop", 2);
    const mixerId = await seedEvent(db, "Founder Mixer", 3);

    await seedOutreach(db, {
      event_id: summitId,
      attio_record_id: "person_1",
      attio_speakers_entry_id: "speaker_1",
      contact_name: "Sarah Chen",
      contact_email: "sarah@example.com",
      inbound_state: "needs_review",
      inbound_count: 2,
      last_inbound_at: 400,
      agentmail_thread_id: "thread-needs-review",
      created_at: 100,
    });
    await seedOutreach(db, {
      event_id: workshopId,
      attio_record_id: "person_2",
      inbound_state: "awaiting_member_reply",
      inbound_count: 1,
      last_inbound_at: 500,
      agentmail_thread_id: "thread-awaiting",
      created_at: 200,
    });
    await seedOutreach(db, {
      event_id: mixerId,
      attio_record_id: "person_3",
      contact_email: "maria@example.com",
      inbound_state: "resolved",
      inbound_count: 3,
      last_inbound_at: 300,
      agentmail_thread_id: "thread-resolved",
      created_at: 300,
    });

    const allThreads = await getHandler<
      { filter?: "all" | "needs_review" | "awaiting_member_reply" | "resolved" },
      Array<Record<string, unknown>>
    >(listOutreachThreads)(ctx as never, { filter: "all" });

    expect(allThreads).toHaveLength(3);
    expect(allThreads.map((row) => row.inbound_state)).toEqual([
      "awaiting_member_reply",
      "needs_review",
      "resolved",
    ]);
    expect(allThreads[0]).toMatchObject({
      event_name: "Builders Workshop",
      inbound_state_label: "Awaiting Reply",
      contact_identifier: "person_2",
    });
    expect(allThreads[1]).toMatchObject({
      attio_speakers_entry_id: "speaker_1",
      contact_name: "Sarah Chen",
      contact_email: "sarah@example.com",
      contact_identifier: "Sarah Chen",
      inbound_state_label: "Needs Review",
      message_count: 2,
    });
    expect(allThreads[2]).toMatchObject({
      inbound_state_label: "Resolved",
      contact_identifier: "maria@example.com",
    });

    const needsReview = await getHandler<
      { filter?: "all" | "needs_review" | "awaiting_member_reply" | "resolved" },
      Array<Record<string, unknown>>
    >(listOutreachThreads)(ctx as never, { filter: "needs_review" });
    expect(needsReview).toHaveLength(1);
    expect(needsReview[0].attio_record_id).toBe("person_1");

    const awaitingReply = await getHandler<
      { filter?: "all" | "needs_review" | "awaiting_member_reply" | "resolved" },
      Array<Record<string, unknown>>
    >(listOutreachThreads)(ctx as never, { filter: "awaiting_member_reply" });
    expect(awaitingReply).toHaveLength(1);
    expect(awaitingReply[0].attio_record_id).toBe("person_2");

    const resolved = await getHandler<
      { filter?: "all" | "needs_review" | "awaiting_member_reply" | "resolved" },
      Array<Record<string, unknown>>
    >(listOutreachThreads)(ctx as never, { filter: "resolved" });
    expect(resolved).toHaveLength(1);
    expect(resolved[0].attio_record_id).toBe("person_3");
  });

  test("listOutreachThreads falls back to receipts for message count and activity", async () => {
    const { db, ctx } = createHarness();
    const eventId = await seedEvent(db, "Fallback Event", 1);
    await seedOutreach(db, {
      event_id: eventId,
      attio_record_id: "person_fallback",
      inbound_state: undefined,
      inbound_count: undefined,
      last_inbound_at: undefined,
      agentmail_thread_id: "thread-fallback",
      created_at: 25,
    });

    await db.insert("inbound_receipts", {
      message_id: "msg_1",
      thread_id: "thread-fallback",
      received_at: 120,
      status: "completed",
    });
    await db.insert("inbound_receipts", {
      message_id: "msg_2",
      thread_id: "thread-fallback",
      received_at: 240,
      status: "completed",
    });

    const rows = await getHandler<
      { filter?: "all" | "needs_review" | "awaiting_member_reply" | "resolved" },
      Array<Record<string, unknown>>
    >(listOutreachThreads)(ctx as never, {});

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      inbound_state: "needs_review",
      inbound_state_label: "Needs Review",
      message_count: 2,
      last_activity_at: 240,
      contact_identifier: "person_fallback",
    });
  });

  test("getOutreachThread returns receipts in chronological order", async () => {
    const { db, ctx } = createHarness();
    const eventId = await seedEvent(db, "Inbox Detail Event", 1);
    const outreachId = await seedOutreach(db, {
      event_id: eventId,
      attio_record_id: "person_detail",
      contact_name: "Jordan Lee",
      contact_email: "jordan@example.com",
      attio_speakers_entry_id: "speaker_detail",
      inbound_state: "awaiting_member_reply",
      inbound_count: undefined,
      last_inbound_at: undefined,
      agentmail_thread_id: "thread-detail",
      created_at: 15,
    });

    await db.insert("inbound_receipts", {
      message_id: "message_b",
      thread_id: "thread-detail",
      received_at: 300,
      status: "processing",
      updated_at: 330,
    });
    await db.insert("inbound_receipts", {
      message_id: "message_a",
      thread_id: "thread-detail",
      received_at: 100,
      status: "completed",
      updated_at: 140,
    });
    await db.insert("inbound_receipts", {
      message_id: "message_c",
      thread_id: "thread-detail",
      received_at: 200,
      status: "completed",
      updated_at: 210,
    });

    const result = await getHandler<{ id: string }, Record<string, unknown> | null>(
      getOutreachThread
    )(ctx as never, { id: outreachId });

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      _id: outreachId,
      attio_record_id: "person_detail",
      attio_speakers_entry_id: "speaker_detail",
      contact_name: "Jordan Lee",
      contact_email: "jordan@example.com",
      contact_identifier: "Jordan Lee",
      inbound_state: "awaiting_member_reply",
      inbound_state_label: "Awaiting Reply",
      message_count: 3,
      last_activity_at: 300,
      event: {
        _id: eventId,
        title: "Inbox Detail Event",
      },
    });
    expect((result?.receipts as Array<{ message_id: string }>).map((receipt) => receipt.message_id)).toEqual([
      "message_a",
      "message_c",
      "message_b",
    ]);
  });
});
