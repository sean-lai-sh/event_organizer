import { describe, expect, test } from "bun:test";

import { getEvent, listEvents, updateEvent } from "./events";

type TableRow = { _id: string } & Record<string, unknown>;
type Tables = Record<"events", TableRow[]>;

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
    private readonly filters: Array<[string, unknown]> = [],
    private readonly sortDirection: "asc" | "desc" | null = null
  ) {}

  order(direction: "asc" | "desc") {
    return new FakeQuery(this.rows, this.filters, direction);
  }

  withIndex(_indexName: string, build: (builder: FakeIndexRangeBuilder) => unknown) {
    const builder = new FakeIndexRangeBuilder();
    build(builder);
    return new FakeQuery(this.rows, builder.filters, this.sortDirection);
  }

  async collect() {
    const filtered = this.rows.filter((row) => this.filters.every(([field, value]) => row[field] === value));
    if (!this.sortDirection) {
      return filtered;
    }
    return [...filtered].sort((a, b) => {
      const left = Number(a.created_at ?? 0);
      const right = Number(b.created_at ?? 0);
      return this.sortDirection === "desc" ? right - left : left - right;
    });
  }
}

class FakeDb {
  private counter = 0;

  readonly tables: Tables = { events: [] };

  query(table: "events") {
    return new FakeQuery(this.tables[table]);
  }

  async get(id: string) {
    return this.tables.events.find((row) => row._id === id) ?? null;
  }

  async insert(table: "events", value: Record<string, unknown>) {
    const id = `${table}:${++this.counter}`;
    this.tables[table].push({ _id: id, ...value });
    return id;
  }

  async patch(id: string, value: Record<string, unknown>) {
    const index = this.tables.events.findIndex((row) => row._id === id);
    if (index === -1) {
      throw new Error(`Missing row: ${id}`);
    }
    this.tables.events[index] = { ...this.tables.events[index], ...value };
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
  for (const fn of [getEvent, listEvents, updateEvent]) {
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
    title: "Default Event",
    description: "Original description",
    event_date: "2026-04-01",
    event_time: "6:00 PM",
    event_end_time: "7:00 PM",
    location: "Room 101",
    event_type: "workshop",
    target_profile: "Students",
    needs_outreach: true,
    status: "draft",
    speaker_confirmed: false,
    room_confirmed: false,
    created_at: 1,
    ...overrides,
  });
}

describe("events", () => {
  test("lists events with optional filtering and limit", async () => {
    const { db, ctx } = createHarness();
    await seedEvent(db, { title: "Old Event", status: "completed", created_at: 1 });
    await seedEvent(db, { title: "Current Event", status: "outreach", created_at: 2 });
    await seedEvent(db, { title: "Fresh Event", status: "draft", created_at: 3 });

    const all = await getHandler<Record<string, never>, Array<{ title: string }>>(listEvents)(ctx as never, {});
    expect(all.map((row) => row.title)).toEqual(["Fresh Event", "Current Event", "Old Event"]);

    const filtered = await getHandler<{ status?: string; limit?: number }, Array<{ title: string }>>(listEvents)(
      ctx as never,
      { status: "outreach", limit: 1 }
    );
    expect(filtered.map((row) => row.title)).toEqual(["Current Event"]);
  });

  test("gets and safely updates event fields", async () => {
    const { db, ctx } = createHarness();
    const eventId = await seedEvent(db);

    const before = await getHandler<{ event_id: string }, unknown>(getEvent)(ctx as never, {
      event_id: eventId,
    });
    expect(before).toMatchObject({
      _id: eventId,
      title: "Default Event",
      speaker_confirmed: false,
      room_confirmed: false,
    });

    await getHandler<
      {
        event_id: string;
        title?: string;
        description?: string;
        event_date?: string;
        event_time?: string;
        event_end_time?: string;
        location?: string;
        status?: string;
        speaker_confirmed?: boolean;
        room_confirmed?: boolean;
      },
      unknown
    >(updateEvent)(ctx as never, {
      event_id: eventId,
      title: "Updated Event",
      description: "Updated description",
      event_date: "2026-04-10",
      event_time: "7:30 PM",
      event_end_time: "9:00 PM",
      location: "Room 202",
      status: "outreach",
      speaker_confirmed: true,
      room_confirmed: true,
    });

    const after = await getHandler<{ event_id: string }, unknown>(getEvent)(ctx as never, {
      event_id: eventId,
    });
    expect(after).toMatchObject({
      _id: eventId,
      title: "Updated Event",
      description: "Updated description",
      event_date: "2026-04-10",
      event_time: "7:30 PM",
      event_end_time: "9:00 PM",
      location: "Room 202",
      status: "outreach",
      speaker_confirmed: true,
      room_confirmed: true,
    });

    await getHandler<
      {
        event_id: string;
        speaker_confirmed?: boolean;
        room_confirmed?: boolean;
      },
      unknown
    >(updateEvent)(ctx as never, {
      event_id: eventId,
      speaker_confirmed: false,
      room_confirmed: false,
    });

    const unchangedBooleans = await getHandler<{ event_id: string }, unknown>(getEvent)(ctx as never, {
      event_id: eventId,
    });
    expect(unchangedBooleans).toMatchObject({
      speaker_confirmed: true,
      room_confirmed: true,
    });
  });
});
