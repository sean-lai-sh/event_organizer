import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

type TableName = "events" | "event_room_bookings";
type TableRow = { _id: string } & Record<string, unknown>;
type Tables = Record<TableName, TableRow[]>;

let requireAdminMemberImpl = async () => ({
  authUser: { _id: "user:1" },
  member: { role: "admin" },
});

mock.module("./eboard", () => ({
  requireAdminMember: () => requireAdminMemberImpl(),
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
    private readonly sortDirection: "asc" | "desc" | null = null,
  ) {}

  order(direction: "asc" | "desc") {
    return new FakeQuery(this.rows, this.filters, direction);
  }

  withIndex(_indexName: string, build: (builder: FakeIndexRangeBuilder) => unknown) {
    const builder = new FakeIndexRangeBuilder();
    build(builder);
    return new FakeQuery(this.rows, builder.filters, this.sortDirection);
  }

  private filtered() {
    const rows = this.rows.filter((row) =>
      this.filters.every(([field, value]) => row[field] === value),
    );
    if (!this.sortDirection) return rows;
    return [...rows].sort((a, b) => {
      const left = Number(a.created_at ?? 0);
      const right = Number(b.created_at ?? 0);
      return this.sortDirection === "desc" ? right - left : left - right;
    });
  }

  async collect() {
    return this.filtered();
  }

  async first() {
    return this.filtered()[0] ?? null;
  }
}

class FakeDb {
  private readonly counters: Record<TableName, number> = {
    events: 0,
    event_room_bookings: 0,
  };

  readonly tables: Tables = {
    events: [],
    event_room_bookings: [],
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
  if (!handler) throw new Error("Convex handler is unavailable in test harness");
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

async function seedEvent(db: FakeDb, overrides: Record<string, unknown> = {}) {
  return await db.insert("events", {
    title: "Event with booking",
    needs_outreach: false,
    status: "draft",
    room_confirmed: false,
    created_at: 1,
    ...overrides,
  });
}

const moduleP = import("./roomBookings");

beforeAll(async () => {
  const { getEventRoomBooking, upsertEventRoomBooking } = await moduleP;
  installConvexHandlerAliases([getEventRoomBooking, upsertEventRoomBooking]);
});

beforeEach(() => {
  requireAdminMemberImpl = async () => ({
    authUser: { _id: "user:1" },
    member: { role: "admin" },
  });
});

describe("roomBookings", () => {
  test("getEventRoomBooking returns null when no booking exists", async () => {
    const { getEventRoomBooking } = await moduleP;
    const { db, ctx } = createHarness();
    const eventId = await seedEvent(db);

    const row = await getHandler<{ event_id: string }, unknown>(getEventRoomBooking)(
      ctx as never,
      { event_id: eventId },
    );
    expect(row).toBeNull();
  });

  test("upsertEventRoomBooking inserts a new row and stickies room_confirmed", async () => {
    const { getEventRoomBooking, upsertEventRoomBooking } = await moduleP;
    const { db, ctx } = createHarness();
    const eventId = await seedEvent(db);

    await getHandler<Record<string, unknown>, unknown>(upsertEventRoomBooking)(ctx as never, {
      event_id: eventId,
      provider: "oncehub",
      page_url: "https://go.oncehub.com/NYULeslie/Lean-Launchpad",
      link_name: "Lean-Launchpad",
      room_label: "Lean/Launchpad",
      booking_status: "confirmed",
      booked_date: "2026-05-15",
      booked_time: "6:00 PM",
      booked_end_time: "7:30 PM",
      duration_minutes: 90,
      slot_start_epoch_ms: 1_747_326_400_000,
      booking_reference: "bk_xyz",
      booking_reference_json: null,
      approver_user_id: "user_42",
      raw_response_json: "{}",
    });

    const rows = db.rows("event_room_bookings");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      event_id: eventId,
      provider: "oncehub",
      room_label: "Lean/Launchpad",
      booking_reference: "bk_xyz",
      approver_user_id: "user_42",
    });

    const event = await db.get(eventId);
    expect(event?.room_confirmed).toBe(true);

    const fetched = await getHandler<{ event_id: string }, unknown>(getEventRoomBooking)(
      ctx as never,
      { event_id: eventId },
    );
    expect(fetched).toMatchObject({ booking_reference: "bk_xyz" });
  });

  test("upsertEventRoomBooking patches the existing booking row in place", async () => {
    const { upsertEventRoomBooking } = await moduleP;
    const { db, ctx } = createHarness();
    const eventId = await seedEvent(db);

    const baseArgs = {
      event_id: eventId,
      provider: "oncehub",
      page_url: "https://go.oncehub.com/NYULeslie/Lean-Launchpad",
      link_name: "Lean-Launchpad",
      room_label: "Lean/Launchpad",
      booking_status: "confirmed",
      booked_date: "2026-05-15",
      booked_time: "6:00 PM",
      booked_end_time: "7:30 PM",
      duration_minutes: 90,
      slot_start_epoch_ms: 1_747_326_400_000,
      booking_reference: "bk_1",
      booking_reference_json: null,
      approver_user_id: null,
      raw_response_json: "{}",
    };

    await getHandler<Record<string, unknown>, unknown>(upsertEventRoomBooking)(
      ctx as never,
      baseArgs as never,
    );
    await getHandler<Record<string, unknown>, unknown>(upsertEventRoomBooking)(ctx as never, {
      ...baseArgs,
      booking_reference: "bk_2",
      booked_time: "7:00 PM",
      booked_end_time: "8:30 PM",
    } as never);

    const rows = db.rows("event_room_bookings");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      booking_reference: "bk_2",
      booked_time: "7:00 PM",
    });
  });

  test("upsertEventRoomBooking errors when the event is missing", async () => {
    const { upsertEventRoomBooking } = await moduleP;
    const { ctx } = createHarness();

    await expect(
      getHandler<Record<string, unknown>, unknown>(upsertEventRoomBooking)(ctx as never, {
        event_id: "events:missing",
        provider: "oncehub",
        page_url: "u",
        link_name: "l",
        room_label: "r",
        booking_status: "confirmed",
        booked_date: "2026-05-15",
        booked_time: "6 PM",
        booked_end_time: "7 PM",
        duration_minutes: 60,
        slot_start_epoch_ms: 1,
        raw_response_json: "{}",
      } as never),
    ).rejects.toThrow("Event not found");
  });
});
