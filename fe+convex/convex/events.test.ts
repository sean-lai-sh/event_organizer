import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

type TableName = "events" | "event_outreach" | "attendance" | "agent_context_links";
type TableRow = { _id: string } & Record<string, unknown>;
type Tables = Record<TableName, TableRow[]>;

let requireAdminMemberImpl: (...args: unknown[]) => Promise<{
  authUser: { _id: string };
  member: { role: string };
}> = async () => ({ authUser: { _id: "user:1" }, member: { role: "admin" } });

mock.module("./eboard", () => ({
  requireAdminMember: (...args: unknown[]) => requireAdminMemberImpl(...args),
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
    const filtered = this.rows.filter((row) =>
      this.filters.every(([field, value]) => row[field] === value)
    );
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
  private readonly counters: Record<TableName, number> = {
    events: 0,
    event_outreach: 0,
    attendance: 0,
    agent_context_links: 0,
  };

  readonly tables: Tables = {
    events: [],
    event_outreach: [],
    attendance: [],
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
    this.tables[table][index] = { ...this.tables[table][index], ...value };
  }

  async delete(id: string) {
    const table = id.split(":")[0] as TableName;
    this.tables[table] = this.tables[table].filter((row) => row._id !== id);
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

function installConvexHandlerAliases(functions: unknown[]) {
  for (const fn of functions) {
    const wrapped = fn as { handler?: unknown; _handler?: unknown };
    if (!wrapped.handler) {
      wrapped.handler = wrapped._handler;
    }
  }
}

function createHarness() {
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

const eventsModulePromise = import("./events");

beforeAll(async () => {
  const {
    applyInboundMilestones,
    createEvent,
    deleteEvent,
    getEvent,
    listEvents,
    updateEvent,
    updateEventStatus,
  } = await eventsModulePromise;
  installConvexHandlerAliases([
    applyInboundMilestones,
    createEvent,
    deleteEvent,
    getEvent,
    listEvents,
    updateEvent,
    updateEventStatus,
  ]);
});

beforeEach(() => {
  requireAdminMemberImpl = async () => ({
    authUser: { _id: "user:1" },
    member: { role: "admin" },
  });
});

describe("events", () => {
  test("createEvent requires admin auth and sets default fields", async () => {
    const { createEvent } = await eventsModulePromise;
    const { db, ctx } = createHarness();

    requireAdminMemberImpl = async () => {
      throw new Error("Admin access required");
    };

    await expect(
      getHandler<
        {
          title: string;
          description?: string;
          event_date?: string;
          event_time?: string;
          event_end_time?: string;
          location?: string;
          event_type?: string;
          target_profile?: string;
          needs_outreach: boolean;
          status: string;
          created_by?: string;
        },
        string
      >(createEvent)(ctx as never, {
        title: "Blocked Event",
        needs_outreach: true,
        status: "draft",
      })
    ).rejects.toThrow("Admin access required");

    requireAdminMemberImpl = async () => ({
      authUser: { _id: "user:1" },
      member: { role: "admin" },
    });

    const eventId = await getHandler<
      {
        title: string;
        description?: string;
        event_date?: string;
        event_time?: string;
        event_end_time?: string;
        location?: string;
        event_type?: string;
        target_profile?: string;
        needs_outreach: boolean;
        status: string;
        created_by?: string;
      },
      string
    >(createEvent)(ctx as never, {
      title: "Admin Event",
      description: "Created by admin",
      event_date: "2026-05-05",
      event_time: "6:30 PM",
      event_end_time: "8:00 PM",
      location: "Main Hall",
      event_type: "panel",
      target_profile: "Builders",
      needs_outreach: true,
      status: "draft",
      created_by: "admin@example.com",
    });

    const created = await db.get(eventId);
    expect(created).toMatchObject({
      _id: eventId,
      title: "Admin Event",
      speaker_confirmed: false,
      room_confirmed: false,
    });
    expect(created?.created_at).toBeNumber();
  });

  test("lists events with optional filtering and limit", async () => {
    const { listEvents } = await eventsModulePromise;
    const { db, ctx } = createHarness();
    await seedEvent(db, { title: "Old Event", status: "completed", created_at: 1 });
    await seedEvent(db, { title: "Current Event", status: "outreach", created_at: 2 });
    await seedEvent(db, { title: "Fresh Event", status: "draft", created_at: 3 });

    const all = await getHandler<Record<string, never>, Array<{ title: string }>>(listEvents)(
      ctx as never,
      {}
    );
    expect(all.map((row) => row.title)).toEqual(["Fresh Event", "Current Event", "Old Event"]);

    const filtered = await getHandler<{ status?: string; limit?: number }, Array<{ title: string }>>(
      listEvents
    )(ctx as never, { status: "outreach", limit: 1 });
    expect(filtered.map((row) => row.title)).toEqual(["Current Event"]);
  });

  test("gets and safely updates event fields", async () => {
    const { getEvent, updateEvent } = await eventsModulePromise;
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

    const unchangedBooleans = await getHandler<{ event_id: string }, unknown>(getEvent)(
      ctx as never,
      {
        event_id: eventId,
      }
    );
    expect(unchangedBooleans).toMatchObject({
      speaker_confirmed: true,
      room_confirmed: true,
    });
  });

  test("requires admin auth for updateEvent", async () => {
    const { updateEvent } = await eventsModulePromise;
    const { db, ctx } = createHarness();
    const eventId = await seedEvent(db);
    requireAdminMemberImpl = async () => {
      throw new Error("Admin access required");
    };

    await expect(
      getHandler<{ event_id: string; title?: string }, unknown>(updateEvent)(ctx as never, {
        event_id: eventId,
        title: "Blocked Update",
      })
    ).rejects.toThrow("Admin access required");
  });

  test("updateEvent throws when the event does not exist", async () => {
    const { updateEvent } = await eventsModulePromise;
    const { ctx } = createHarness();

    await expect(
      getHandler<{ event_id: string; title?: string }, unknown>(updateEvent)(ctx as never, {
        event_id: "events:999",
        title: "Missing Event",
      })
    ).rejects.toThrow("Event not found: events:999");
  });

  test("updateEventStatus requires admin auth and patches status", async () => {
    const { updateEventStatus } = await eventsModulePromise;
    const { db, ctx } = createHarness();
    const eventId = await seedEvent(db, { status: "draft" });

    requireAdminMemberImpl = async () => {
      throw new Error("Admin access required");
    };

    await expect(
      getHandler<{ event_id: string; status: string }, void>(updateEventStatus)(ctx as never, {
        event_id: eventId,
        status: "outreach",
      })
    ).rejects.toThrow("Admin access required");

    requireAdminMemberImpl = async () => ({
      authUser: { _id: "user:1" },
      member: { role: "admin" },
    });

    await getHandler<{ event_id: string; status: string }, void>(updateEventStatus)(
      ctx as never,
      {
        event_id: eventId,
        status: "outreach",
      }
    );

    expect(await db.get(eventId)).toMatchObject({
      _id: eventId,
      status: "outreach",
    });
  });

  test("requires admin auth and cascades event deletion", async () => {
    const { deleteEvent } = await eventsModulePromise;
    const { db, ctx } = createHarness();
    const eventId = await seedEvent(db, { title: "Delete Me" });
    const otherEventId = await seedEvent(db, { title: "Keep Me" });

    await db.insert("event_outreach", {
      event_id: eventId,
      attio_record_id: "person_1",
      suggested: true,
      approved: false,
      outreach_sent: false,
      created_at: 1,
    });
    await db.insert("event_outreach", {
      event_id: otherEventId,
      attio_record_id: "person_2",
      suggested: true,
      approved: false,
      outreach_sent: false,
      created_at: 2,
    });
    await db.insert("attendance", {
      event_id: eventId,
      email: "sam@example.com",
      checked_in_at: 100,
      source: "manual",
    });
    await db.insert("attendance", {
      event_id: otherEventId,
      email: "lee@example.com",
      checked_in_at: 200,
      source: "manual",
    });
    await db.insert("agent_context_links", {
      thread_id: "agent_threads:1",
      run_id: "agent_runs:1",
      link_key: "event-link",
      relation: "primary",
      entity_type: "event",
      entity_id: eventId,
      created_at: 1,
      updated_at: 1,
    });
    await db.insert("agent_context_links", {
      thread_id: "agent_threads:1",
      run_id: "agent_runs:1",
      link_key: "other-link",
      relation: "primary",
      entity_type: "event",
      entity_id: otherEventId,
      created_at: 2,
      updated_at: 2,
    });

    await getHandler<{ event_id: string }, unknown>(deleteEvent)(ctx as never, { event_id: eventId });

    expect(await db.get(eventId)).toBeNull();
    expect(db.rows("event_outreach")).toHaveLength(1);
    expect(db.rows("event_outreach")[0].event_id).toBe(otherEventId);
    expect(db.rows("attendance")).toHaveLength(1);
    expect(db.rows("attendance")[0].event_id).toBe(otherEventId);
    expect(db.rows("agent_context_links")).toHaveLength(1);
    expect(db.rows("agent_context_links")[0].entity_id).toBe(otherEventId);

    requireAdminMemberImpl = async () => {
      throw new Error("Admin access required");
    };

    await expect(
      getHandler<{ event_id: string }, unknown>(deleteEvent)(ctx as never, {
        event_id: otherEventId,
      })
    ).rejects.toThrow("Admin access required");
  });

  test("deleteEvent throws when the event does not exist", async () => {
    const { deleteEvent } = await eventsModulePromise;
    const { ctx } = createHarness();

    await expect(
      getHandler<{ event_id: string }, unknown>(deleteEvent)(ctx as never, {
        event_id: "events:999",
      })
    ).rejects.toThrow("Event not found.");
  });

  test("applyInboundMilestones requires admin auth and keeps sticky true semantics", async () => {
    const { applyInboundMilestones } = await eventsModulePromise;
    const { db, ctx } = createHarness();
    const eventId = await seedEvent(db, {
      speaker_confirmed: false,
      room_confirmed: false,
    });

    requireAdminMemberImpl = async () => {
      throw new Error("Admin access required");
    };

    await expect(
      getHandler<
        { event_id: string; speaker_confirmed?: boolean; room_confirmed?: boolean },
        void
      >(applyInboundMilestones)(ctx as never, {
        event_id: eventId,
        speaker_confirmed: true,
        room_confirmed: true,
      })
    ).rejects.toThrow("Admin access required");

    requireAdminMemberImpl = async () => ({
      authUser: { _id: "user:1" },
      member: { role: "admin" },
    });

    await getHandler<
      { event_id: string; speaker_confirmed?: boolean; room_confirmed?: boolean },
      void
    >(applyInboundMilestones)(ctx as never, {
      event_id: eventId,
      speaker_confirmed: true,
      room_confirmed: true,
    });

    expect(await db.get(eventId)).toMatchObject({
      _id: eventId,
      speaker_confirmed: true,
      room_confirmed: true,
    });

    await getHandler<
      { event_id: string; speaker_confirmed?: boolean; room_confirmed?: boolean },
      void
    >(applyInboundMilestones)(ctx as never, {
      event_id: eventId,
      speaker_confirmed: false,
      room_confirmed: false,
    });

    expect(await db.get(eventId)).toMatchObject({
      _id: eventId,
      speaker_confirmed: true,
      room_confirmed: true,
    });
  });

  test("applyInboundMilestones throws when the event does not exist", async () => {
    const { applyInboundMilestones } = await eventsModulePromise;
    const { ctx } = createHarness();

    await expect(
      getHandler<
        { event_id: string; speaker_confirmed?: boolean; room_confirmed?: boolean },
        void
      >(applyInboundMilestones)(ctx as never, {
        event_id: "events:999",
        speaker_confirmed: true,
      })
    ).rejects.toThrow("Event not found: events:999");
  });
});
