import { describe, expect, test } from "bun:test";

import { getEventInboundStatus } from "./inboundDashboard";
import { getEventOutreach as getEventOutreachAlias } from "./outreach";

type TableRow = { _id: string } & Record<string, unknown>;
type Tables = Record<"events" | "event_outreach", TableRow[]>;

class FakeIndexRangeBuilder {
  readonly filters: Array<[string, unknown]> = [];

  eq(field: string, value: unknown) {
    this.filters.push([field, value]);
    return this;
  }
}

class FakeQuery {
  constructor(private readonly rows: TableRow[], private readonly filters: Array<[string, unknown]> = []) {}

  order(_direction: "asc" | "desc") {
    return this;
  }

  withIndex(_indexName: string, build: (builder: FakeIndexRangeBuilder) => unknown) {
    const builder = new FakeIndexRangeBuilder();
    build(builder);
    return new FakeQuery(this.rows, builder.filters);
  }

  async collect() {
    return this.rows.filter((row) => this.filters.every(([field, value]) => row[field] === value));
  }

  async first() {
    const matches = await this.collect();
    return matches[0] ?? null;
  }
}

class FakeDb {
  private counters = { events: 0, event_outreach: 0 };

  readonly tables: Tables = {
    events: [],
    event_outreach: [],
  };

  query(table: "events" | "event_outreach") {
    return new FakeQuery(this.tables[table]);
  }

  async get(id: string) {
    const table = id.split(":")[0] as "events" | "event_outreach";
    return this.tables[table].find((row) => row._id === id) ?? null;
  }

  async insert(table: "events" | "event_outreach", value: Record<string, unknown>) {
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
  for (const fn of [getEventInboundStatus, getEventOutreachAlias]) {
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

async function seedEvent(db: FakeDb, overrides: Record<string, unknown> = {}) {
  return await db.insert("events", {
    title: "AI Forum",
    description: "Talks and demos",
    event_date: "2026-04-20",
    event_time: "6:00 PM",
    event_end_time: "8:00 PM",
    location: "Main Hall",
    event_type: "workshop",
    target_profile: "Students",
    needs_outreach: true,
    status: "outreach",
    speaker_confirmed: true,
    room_confirmed: false,
    created_at: 1,
    ...overrides,
  });
}

describe("outreach and inbound status", () => {
  test("exposes event outreach through the alias", async () => {
    const { db, ctx } = createHarness();
    const eventId = await seedEvent(db);

    await db.insert("event_outreach", {
      event_id: eventId,
      attio_record_id: "person_1",
      suggested: true,
      approved: false,
      outreach_sent: false,
      response: "pending",
      inbound_state: "needs_review",
      inbound_count: 2,
      created_at: 2,
    });

    const rows = await getHandler<{ event_id: string; approved?: boolean }, Array<Record<string, unknown>>>(
      getEventOutreachAlias
    )(ctx as never, { event_id: eventId });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      attio_record_id: "person_1",
      approved: false,
      response: "pending",
    });
  });

  test("returns inbound status summaries for a specific event", async () => {
    const { db, ctx } = createHarness();
    const eventId = await seedEvent(db, { title: "Inbound Event" });

    await db.insert("event_outreach", {
      event_id: eventId,
      attio_record_id: "person_1",
      suggested: true,
      approved: false,
      outreach_sent: false,
      response: "accepted",
      inbound_state: "resolved",
      inbound_count: 3,
      last_inbound_at: 400,
      last_inbound_from: "speaker@example.com",
      last_classification: "ACCEPTED",
      created_at: 2,
    });

    const result = await getHandler<{ event_id?: string }, Array<Record<string, unknown>>>(
      getEventInboundStatus
    )(ctx as never, { event_id: eventId });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      event_id: eventId,
      title: "Inbound Event",
      status: "outreach",
      summary: {
        threads: 1,
        inbound_messages: 3,
        accepted: 1,
        declined: 0,
        pending: 0,
        needs_review: 0,
        awaiting_member_reply: 0,
        resolved: 1,
      },
      threads: [
        {
          attio_record_id: "person_1",
          response: "accepted",
          inbound_state: "resolved",
          inbound_count: 3,
          last_inbound_at: 400,
          last_inbound_from: "speaker@example.com",
          last_classification: "ACCEPTED",
        },
      ],
    });
  });
});
