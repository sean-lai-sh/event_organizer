import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  deleteDemoData,
  getAttendeeProfiles,
  getLatestInsight,
  getAttendanceStats,
  getAttendanceTrends,
  importAttendanceBatch,
  recordAttendance,
  seedDemoData,
} from "./attendance";

type TableName = "attendance" | "attendance_insights" | "events";
type TableRow = { _id: string } & Record<string, unknown>;
type Tables = Record<TableName, TableRow[]>;
type EmptyArgs = Record<string, never>;
type SeedDemoResult = {
  event_ids: string[];
  events_created: number;
  attendance_imported: number;
  insight_id: string | null;
};
type AttendanceStatsResult = {
  total_events_tracked: number;
  total_unique_attendees: number;
  avg_attendance: number;
  top_event: { title: string; count: number } | null;
};
type TrendResult = {
  event_id: string;
  title: string;
  event_date: string;
  event_type: string;
  attendee_count: number;
};
type AttendeeProfileResult = {
  email: string;
  name: string | null;
  events_attended: number;
  first_seen: string;
  last_seen: string;
  event_types: string[];
  streak: number;
  is_active: boolean;
  interest_prediction: unknown;
};
type InsightResult = {
  _id: string;
  insight_text: string;
};
type CleanupResult = {
  events_deleted: number;
  attendance_deleted: number;
  insights_deleted: number;
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
    attendance: 0,
    attendance_insights: 0,
    events: 0,
  };

  readonly tables: Tables = {
    attendance: [],
    attendance_insights: [],
    events: [],
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

  async delete(id: string) {
    const table = id.split(":")[0] as TableName;
    this.tables[table] = this.tables[table].filter((row) => row._id !== id);
  }

  rows(table: TableName) {
    return [...this.tables[table]];
  }
}

function installConvexHandlerAliases() {
  for (const fn of [getAttendanceStats, getAttendanceTrends, getAttendeeProfiles, getLatestInsight]) {
    const wrapped = fn as typeof fn & { handler?: unknown; _handler?: unknown };
    if (!wrapped.handler) {
      wrapped.handler = wrapped._handler;
    }
  }
}

function getHandler<TArgs, TResult>(fn: unknown) {
  const wrapped = fn as { handler?: (ctx: unknown, args: TArgs) => Promise<TResult>; _handler?: (ctx: unknown, args: TArgs) => Promise<TResult> };
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

  return {
    ctx,
    db,
    async insertEvent(overrides: Record<string, unknown> = {}) {
      return (await db.insert("events", {
        title: "Attendance MVP Test Event",
        description: "Seeded in-memory for attendance mutation tests",
        event_date: "2026-04-01",
        event_time: "18:00",
        event_end_time: "19:00",
        location: "NYU",
        event_type: "workshop",
        target_profile: "student_builders",
        needs_outreach: false,
        status: "completed",
        created_by: "test@event.organizer",
        created_at: 1,
        ...overrides,
      })) as string;
    },
    async insertAttendance(overrides: Record<string, unknown>) {
      return await db.insert("attendance", {
        event_id: overrides.event_id,
        email: overrides.email,
        name: overrides.name,
        checked_in_at: overrides.checked_in_at ?? 1,
        source: overrides.source ?? "manual",
      });
    },
    async insertInsight(overrides: Record<string, unknown> = {}) {
      return await db.insert("attendance_insights", {
        generated_at: overrides.generated_at ?? 1,
        insight_text: overrides.insight_text ?? "baseline insight",
        data_snapshot: overrides.data_snapshot ?? "{}",
        event_count: overrides.event_count ?? 0,
        attendee_count: overrides.attendee_count ?? 0,
      });
    },
  };
}

const ORIGINAL_ALLOW_TEST_MUTATIONS = process.env.ALLOW_TEST_MUTATIONS;

beforeEach(() => {
  delete process.env.ALLOW_TEST_MUTATIONS;
});

afterEach(() => {
  if (ORIGINAL_ALLOW_TEST_MUTATIONS === undefined) {
    delete process.env.ALLOW_TEST_MUTATIONS;
    return;
  }

  process.env.ALLOW_TEST_MUTATIONS = ORIGINAL_ALLOW_TEST_MUTATIONS;
});

describe("attendance MVP write behavior", () => {
  test("recordAttendance deduplicates by event and normalized email", async () => {
    const { ctx, db, insertEvent } = createHarness();
    const eventId = await insertEvent();

    const firstId = await getHandler<
      { event_id: string; email: string; name?: string; source?: string },
      string
    >(recordAttendance)(ctx as never, {
      event_id: eventId,
      email: " Casey@example.com ",
      name: " Casey ",
      source: "manual",
    });
    const secondId = await getHandler<
      { event_id: string; email: string; name?: string; source?: string },
      string
    >(recordAttendance)(ctx as never, {
      event_id: eventId,
      email: "casey@EXAMPLE.com",
      name: "Casey Duplicate",
      source: "csv_import",
    });

    expect(secondId).toBe(firstId);

    const attendanceRows = db.rows("attendance");
    expect(attendanceRows).toHaveLength(1);
    expect(attendanceRows[0]).toMatchObject({
      event_id: eventId,
      email: "casey@example.com",
      name: "Casey",
      source: "manual",
    });

    const insightRows = db.rows("attendance_insights");
    expect(insightRows).toHaveLength(1);
    expect(insightRows[0]).toMatchObject({
      event_count: 1,
      attendee_count: 1,
    });
  });

  test("importAttendanceBatch reports imported vs duplicates and appends a refreshed insight when new rows land", async () => {
    const { ctx, db, insertAttendance, insertEvent, insertInsight } = createHarness();
    const eventId = await insertEvent();

    await insertAttendance({
      event_id: eventId,
      email: "existing@example.com",
      name: "Existing",
    });
    await insertInsight({
      generated_at: 10,
      insight_text: "previous snapshot",
      event_count: 1,
      attendee_count: 1,
    });

    const result = await getHandler<
      {
        event_id: string;
        rows: Array<{ email: string; name?: string }>;
      },
      { imported: number; duplicates: number }
    >(importAttendanceBatch)(ctx as never, {
      event_id: eventId,
      rows: [
        { email: "existing@example.com", name: "Existing Again" },
        { email: "new.one@example.com", name: "New One" },
        { email: " NEW.ONE@example.com ", name: "New One Duplicate" },
        { email: "new.two@example.com", name: "New Two" },
        { email: "not-an-email", name: "Ignored" },
      ],
    });

    expect(result).toEqual({ imported: 2, duplicates: 2 });

    const attendanceRows = db.rows("attendance");
    expect(attendanceRows).toHaveLength(3);
    expect(attendanceRows.map((row) => row.email)).toEqual([
      "existing@example.com",
      "new.one@example.com",
      "new.two@example.com",
    ]);

    const insightRows = db.rows("attendance_insights");
    expect(insightRows).toHaveLength(2);
    expect(insightRows[1]).toMatchObject({
      event_count: 1,
      attendee_count: 3,
    });
    expect(typeof insightRows[1]?.data_snapshot).toBe("string");
  });

  test("duplicate-only imports do not add attendance rows or create another insight snapshot", async () => {
    const { ctx, db, insertAttendance, insertEvent, insertInsight } = createHarness();
    const eventId = await insertEvent();

    await insertAttendance({
      event_id: eventId,
      email: "repeat@example.com",
      name: "Repeat",
    });
    await insertInsight({
      generated_at: 5,
      insight_text: "only snapshot",
      event_count: 1,
      attendee_count: 1,
    });

    const result = await getHandler<
      {
        event_id: string;
        rows: Array<{ email: string; name?: string }>;
      },
      { imported: number; duplicates: number }
    >(importAttendanceBatch)(ctx as never, {
      event_id: eventId,
      rows: [
        { email: "repeat@example.com", name: "Repeat Again" },
        { email: " REPEAT@example.com ", name: "Repeat Batch Duplicate" },
        { email: "invalid-email", name: "Ignored" },
      ],
    });

    expect(result).toEqual({ imported: 0, duplicates: 2 });
    expect(db.rows("attendance")).toHaveLength(1);
    expect(db.rows("attendance_insights")).toHaveLength(1);
    expect(db.rows("attendance_insights")[0]).toMatchObject({
      insight_text: "only snapshot",
      attendee_count: 1,
    });
  });

  test("seedDemoData is idempotent and populates dashboard queries", async () => {
    const { ctx, db } = createHarness();

    const firstResult = await getHandler<EmptyArgs, SeedDemoResult>(seedDemoData)(
      ctx as never,
      {}
    );
    const stats = await getHandler<EmptyArgs, AttendanceStatsResult>(getAttendanceStats)(
      ctx as never,
      {}
    );
    const trends = await getHandler<EmptyArgs, TrendResult[]>(getAttendanceTrends)(
      ctx as never,
      {}
    );
    const profiles = await getHandler<{ min_events?: number }, AttendeeProfileResult[]>(
      getAttendeeProfiles
    )(ctx as never, { min_events: 0 });
    const latestInsight = await getHandler<EmptyArgs, InsightResult | null>(getLatestInsight)(
      ctx as never,
      {}
    );

    expect(firstResult.events_created).toBe(3);
    expect(firstResult.attendance_imported).toBe(18);
    expect(stats).toEqual({
      total_events_tracked: 3,
      total_unique_attendees: 10,
      avg_attendance: 6,
      top_event: { title: "[Demo] Agent Workshop", count: 7 },
    });
    expect(trends).toHaveLength(3);
    expect(profiles.length).toBeGreaterThan(0);
    expect(latestInsight?._id).toBe(firstResult.insight_id);

    const secondResult = await getHandler<EmptyArgs, SeedDemoResult>(seedDemoData)(
      ctx as never,
      {}
    );

    expect(secondResult).toEqual({
      event_ids: firstResult.event_ids,
      events_created: 0,
      attendance_imported: 0,
      insight_id: firstResult.insight_id,
    });
    expect(db.rows("events")).toHaveLength(3);
    expect(db.rows("attendance")).toHaveLength(18);
    expect(db.rows("attendance_insights")).toHaveLength(1);
  });

  test("deleteDemoData removes only demo attendance artifacts", async () => {
    const { ctx, db, insertEvent, insertAttendance, insertInsight } = createHarness();
    await getHandler<EmptyArgs, SeedDemoResult>(seedDemoData)(ctx as never, {});

    const manualEventId = await insertEvent({
      title: "Manual Event",
      description: "Non-demo row that should survive cleanup.",
      created_by: "seanlai@nyu.edu",
    });
    await insertAttendance({
      event_id: manualEventId,
      email: "manual@example.com",
      name: "Manual Member",
      source: "manual",
    });
    await insertInsight({
      generated_at: 99,
      insight_text: "Manual insight should survive cleanup.",
      data_snapshot: JSON.stringify({ trends: [], stats: {} }),
      event_count: 1,
      attendee_count: 1,
    });

    process.env.ALLOW_TEST_MUTATIONS = "true";
    const deleted = await getHandler<EmptyArgs, CleanupResult>(deleteDemoData)(ctx as never, {});
    const statsAfterCleanup = await getHandler<EmptyArgs, AttendanceStatsResult>(
      getAttendanceStats
    )(ctx as never, {});

    expect(deleted).toEqual({
      events_deleted: 3,
      attendance_deleted: 18,
      insights_deleted: 1,
    });
    expect(db.rows("events")).toHaveLength(1);
    expect(db.rows("attendance")).toHaveLength(1);
    expect(db.rows("attendance_insights")).toHaveLength(1);
    expect(statsAfterCleanup).toEqual({
      total_events_tracked: 1,
      total_unique_attendees: 1,
      avg_attendance: 1,
      top_event: { title: "Manual Event", count: 1 },
    });
  });
});
