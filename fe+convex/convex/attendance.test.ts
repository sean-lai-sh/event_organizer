import { describe, expect, test } from "bun:test";

import {
  getAttendanceDashboard,
  getAttendanceForEvent,
  recordAttendanceInsight,
  upsertAttendanceBatch,
} from "./attendance";

type TableName = "events" | "attendance" | "attendance_insights";
type TableRow = { _id: string } & Record<string, unknown>;
type Tables = Record<TableName, TableRow[]>;
type AttendanceDashboardResult = {
  totals: {
    events_tracked: number;
    unique_attendees: number;
    total_check_ins: number;
    latest_check_in_at: number | null;
    by_source: Record<string, number>;
  };
  event_breakdown: Array<{
    event_id: string;
    title: string;
    event_date: string | null;
    attendee_count: number;
    latest_check_in_at: number | null;
    sources: Record<string, number>;
  }>;
  repeat_attendees: Array<{
    email: string;
    name: string | null;
    event_count: number;
    latest_check_in_at: number;
  }>;
  recent_attendance: Array<{
    _id: string;
    event_id: string;
    event_title: string;
    event_date: string | null;
    email: string;
    name: string | null;
    checked_in_at: number;
    source: string | null;
  }>;
  latest_insight: {
    _id: string;
    generated_at: number;
    insight_text: string;
    data_snapshot: string | null;
    event_count: number;
    attendee_count: number;
  } | null;
};

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

  async unique() {
    const matches = await this.collect();
    return matches[0] ?? null;
  }
}

class FakeDb {
  private readonly counters: Record<TableName, number> = {
    events: 0,
    attendance: 0,
    attendance_insights: 0,
  };

  readonly tables: Tables = {
    events: [],
    attendance: [],
    attendance_insights: [],
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
    getAttendanceDashboard,
    getAttendanceForEvent,
    recordAttendanceInsight,
    upsertAttendanceBatch,
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

async function seedEvent(db: FakeDb, overrides: Record<string, unknown> = {}) {
  return await db.insert("events", {
    title: "AI Forum",
    needs_outreach: false,
    status: "completed",
    created_at: 1,
    ...overrides,
  });
}

function createHarness() {
  installConvexHandlerAliases();

  const db = new FakeDb();
  const ctx = { db };

  return { db, ctx };
}

describe("attendance state", () => {
  test("deduplicates event attendance by normalized email and preserves earliest check-in", async () => {
    const { db, ctx } = createHarness();
    const eventId = await seedEvent(db, { title: "Founder Summit", event_date: "2026-04-01" });

    const result = await getHandler<
      {
        event_id: string;
        attendees: Array<{
          email: string;
          name?: string;
          checked_in_at?: number;
          source?: string;
        }>;
      },
      {
        processed_count: number;
        inserted_count: number;
        updated_count: number;
        invalid_count: number;
      }
    >(upsertAttendanceBatch)(ctx as never, {
      event_id: eventId,
      attendees: [
        {
          email: " Sam@Example.com ",
          name: "Sam Rivera",
          checked_in_at: 200,
          source: "manual",
        },
        {
          email: "sam@example.com",
          name: "Samuel Rivera",
          checked_in_at: 180,
          source: "csv_import",
        },
        {
          email: "invalid-email",
          name: "Nope",
        },
      ],
    });

    expect(result).toMatchObject({
      processed_count: 1,
      inserted_count: 1,
      updated_count: 0,
      invalid_count: 1,
    });

    const rows = db.rows("attendance");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email: "sam@example.com",
      name: "Samuel Rivera",
      checked_in_at: 180,
      source: "csv_import",
    });

    await getHandler<
      {
        event_id: string;
        attendees: Array<{
          email: string;
          name?: string;
          checked_in_at?: number;
          source?: string;
        }>;
      },
      unknown
    >(upsertAttendanceBatch)(ctx as never, {
      event_id: eventId,
      attendees: [
        {
          email: "sam@example.com",
          name: "Sam Rivera",
          checked_in_at: 250,
          source: "manual",
        },
      ],
    });

    expect(db.rows("attendance")).toHaveLength(1);
    expect(db.rows("attendance")[0]).toMatchObject({
      email: "sam@example.com",
      name: "Sam Rivera",
      checked_in_at: 180,
      source: "manual",
    });
  });

  test("returns attendance for a single event through the MCP alias", async () => {
    const { db, ctx } = createHarness();
    const eventId = await seedEvent(db, {
      title: "Founder Summit",
      event_date: "2026-04-01",
    });

    await db.insert("attendance", {
      event_id: eventId,
      email: "sam@example.com",
      name: "Sam Rivera",
      checked_in_at: 150,
      source: "manual",
    });
    await db.insert("attendance", {
      event_id: eventId,
      email: "lee@example.com",
      name: "Lee Chen",
      checked_in_at: 200,
      source: "csv_import",
    });

    const result = await getHandler<{ event_id: string }, unknown>(getAttendanceForEvent)(ctx as never, {
      event_id: eventId,
    });

    expect(result).toMatchObject({
      event: {
        _id: eventId,
        title: "Founder Summit",
        event_date: "2026-04-01",
      },
    });
    expect((result as { attendees: Array<{ email: string; checked_in_at: number }> }).attendees.map((row) => row.email)).toEqual([
      "lee@example.com",
      "sam@example.com",
    ]);
  });

  test("builds dashboard summaries including repeats and latest insight", async () => {
    const { db, ctx } = createHarness();
    const eventA = await seedEvent(db, {
      title: "Founder Summit",
      event_date: "2026-04-01",
      created_at: 1,
    });
    const eventB = await seedEvent(db, {
      title: "AI Fireside",
      event_date: "2026-04-20",
      created_at: 2,
    });

    await db.insert("attendance", {
      event_id: eventA,
      email: "sam@example.com",
      name: "Sam Rivera",
      checked_in_at: 100,
      source: "manual",
    });
    await db.insert("attendance", {
      event_id: eventA,
      email: "lee@example.com",
      name: "Lee Chen",
      checked_in_at: 110,
      source: "csv_import",
    });
    await db.insert("attendance", {
      event_id: eventB,
      email: "sam@example.com",
      name: "Sam Rivera",
      checked_in_at: 220,
      source: "manual",
    });
    await db.insert("attendance_insights", {
      generated_at: 300,
      insight_text: "Repeat attendance is increasing.",
      data_snapshot: "{\"sample\":true}",
      event_count: 2,
      attendee_count: 2,
    });

    const dashboard = await getHandler<Record<string, never>, AttendanceDashboardResult>(
      getAttendanceDashboard
    )(ctx as never, {});

    expect(dashboard.totals).toMatchObject({
      events_tracked: 2,
      unique_attendees: 2,
      total_check_ins: 3,
      latest_check_in_at: 220,
    });
    expect(dashboard.totals.by_source).toEqual({
      manual: 2,
      csv_import: 1,
    });
    expect(dashboard.event_breakdown.map((event) => event.title)).toEqual([
      "Founder Summit",
      "AI Fireside",
    ]);
    expect(dashboard.repeat_attendees).toEqual([
      {
        email: "sam@example.com",
        name: "Sam Rivera",
        event_count: 2,
        latest_check_in_at: 220,
      },
    ]);
    expect(dashboard.recent_attendance[0]).toMatchObject({
      event_title: "AI Fireside",
      email: "sam@example.com",
    });
    expect(dashboard.latest_insight).toMatchObject({
      insight_text: "Repeat attendance is increasing.",
      event_count: 2,
      attendee_count: 2,
    });
  });

  test("records append-only attendance insights from current dashboard counts", async () => {
    const { db, ctx } = createHarness();
    const eventId = await seedEvent(db, {
      title: "Workshop Night",
      event_date: "2026-05-01",
    });

    await db.insert("attendance", {
      event_id: eventId,
      email: "jules@example.com",
      name: "Jules Park",
      checked_in_at: 410,
      source: "manual",
    });

    const insightId = await getHandler<
      { insight_text: string; data_snapshot?: string },
      string
    >(recordAttendanceInsight)(ctx as never, {
      insight_text: "Small-format events are converting cleanly.",
    });

    expect(insightId).toBe("attendance_insights:1");
    expect(db.rows("attendance_insights")).toHaveLength(1);
    expect(db.rows("attendance_insights")[0]).toMatchObject({
      insight_text: "Small-format events are converting cleanly.",
      event_count: 1,
      attendee_count: 1,
    });
  });
});
