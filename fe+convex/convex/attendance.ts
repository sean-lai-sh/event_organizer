import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type AttendanceRow = Doc<"attendance">;
type EventRow = Doc<"events">;
type AttendanceInsightRow = Doc<"attendance_insights">;

type TrendRow = {
  event_id: Id<"events">;
  title: string;
  event_date: string;
  event_type: string;
  attendee_count: number;
};

type EventContext = {
  event: EventRow;
  attendeeCount: number;
};

type InterestPrediction = {
  primary_type: string;
  type_distribution: Record<string, number>;
  confidence: "low" | "medium" | "high";
};

type AttendeeProfile = {
  email: string;
  name: string | null;
  events_attended: number;
  first_seen: string;
  last_seen: string;
  event_types: string[];
  streak: number;
  is_active: boolean;
  interest_prediction: InterestPrediction | null;
};

type AttendanceStats = {
  total_events_tracked: number;
  total_unique_attendees: number;
  avg_attendance: number;
  top_event: { title: string; count: number } | null;
};

type AttendanceDataContext = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

type DemoEventSeed = {
  title: string;
  description: string;
  event_date: string;
  event_time: string;
  event_end_time: string;
  location: string;
  event_type: string;
  attendees: Array<{ email: string; name: string }>;
};

type InsightSnapshotPayload = {
  trends: TrendRow[];
  stats: AttendanceStats;
  seed_key?: string;
  source?: string;
};

const DEMO_ATTENDANCE_SEED_KEY = "demo_attendance_v1";
const DEMO_ATTENDANCE_SOURCE = "demo_seed";
const DEMO_EVENT_CREATED_BY = "demo@event.organizer";
const DEMO_EVENT_TARGET_PROFILE = "Seeded sample event for the data dashboard.";

const DEMO_EVENT_SEEDS: DemoEventSeed[] = [
  {
    title: "[Demo] AI Founder Panel",
    description: "Seeded sample event for the attendance dashboard.",
    event_date: "2026-02-12",
    event_time: "18:00",
    event_end_time: "19:30",
    location: "Kimmel 808",
    event_type: "speaker_panel",
    attendees: [
      { email: "alex@example.com", name: "Alex Chen" },
      { email: "sam@example.com", name: "Sam Patel" },
      { email: "jordan@example.com", name: "Jordan Lee" },
      { email: "casey@example.com", name: "Casey Kim" },
      { email: "morgan@example.com", name: "Morgan Diaz" },
      { email: "riley@example.com", name: "Riley Brown" },
    ],
  },
  {
    title: "[Demo] Agent Workshop",
    description: "Seeded sample event for the attendance dashboard.",
    event_date: "2026-03-03",
    event_time: "17:30",
    event_end_time: "19:00",
    location: "Tandon Maker Space",
    event_type: "workshop",
    attendees: [
      { email: "alex@example.com", name: "Alex Chen" },
      { email: "sam@example.com", name: "Sam Patel" },
      { email: "morgan@example.com", name: "Morgan Diaz" },
      { email: "jamie@example.com", name: "Jamie Park" },
      { email: "taylor@example.com", name: "Taylor Singh" },
      { email: "drew@example.com", name: "Drew Flores" },
      { email: "quinn@example.com", name: "Quinn Young" },
    ],
  },
  {
    title: "[Demo] Spring Mixer",
    description: "Seeded sample event for the attendance dashboard.",
    event_date: "2026-03-21",
    event_time: "19:00",
    event_end_time: "21:00",
    location: "Washington Square Park",
    event_type: "networking",
    attendees: [
      { email: "alex@example.com", name: "Alex Chen" },
      { email: "casey@example.com", name: "Casey Kim" },
      { email: "jamie@example.com", name: "Jamie Park" },
      { email: "riley@example.com", name: "Riley Brown" },
      { email: "quinn@example.com", name: "Quinn Young" },
    ],
  },
];

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeName(name?: string) {
  const trimmed = name?.trim();
  return trimmed ? trimmed : undefined;
}

function compareDateAsc(a: string | undefined, b: string | undefined) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

function compareDateDesc(a: string | undefined, b: string | undefined) {
  return compareDateAsc(b, a);
}

function eventTypeLabel(eventType?: string) {
  const raw = (eventType ?? "unknown").trim();
  if (!raw) return "unknown";
  return raw;
}

function isSameDemoEventSeed(event: Pick<EventRow, "title" | "event_date" | "created_by">, seed: DemoEventSeed) {
  return (
    event.title === seed.title &&
    event.event_date === seed.event_date &&
    event.created_by === DEMO_EVENT_CREATED_BY
  );
}

function buildInsightSnapshotData(
  stats: AttendanceStats,
  trends: TrendRow[],
  metadata?: Pick<InsightSnapshotPayload, "seed_key" | "source">
) {
  const payload: InsightSnapshotPayload = {
    trends,
    stats,
    ...(metadata ?? {}),
  };

  return JSON.stringify(payload);
}

function isDemoInsight(insight: Pick<AttendanceInsightRow, "data_snapshot">) {
  if (!insight.data_snapshot) {
    return false;
  }

  try {
    const parsed = JSON.parse(insight.data_snapshot) as InsightSnapshotPayload;
    return parsed.seed_key === DEMO_ATTENDANCE_SEED_KEY;
  } catch {
    return false;
  }
}

async function getTrackedEventContextsFromDb(ctx: AttendanceDataContext) {
  const attendanceRows: AttendanceRow[] = await ctx.db.query("attendance").collect();
  const uniqueEventIds = [...new Set(attendanceRows.map((row) => row.event_id))];
  const countsByEventId = new Map<Id<"events">, number>();

  for (const row of attendanceRows) {
    countsByEventId.set(row.event_id, (countsByEventId.get(row.event_id) ?? 0) + 1);
  }

  const events = await Promise.all(uniqueEventIds.map((eventId) => ctx.db.get(eventId)));
  const contexts: EventContext[] = [];

  events.forEach((event: EventRow | null, index: number) => {
    const eventId = uniqueEventIds[index];
    if (!event) return;
    contexts.push({
      event,
      attendeeCount: countsByEventId.get(eventId) ?? 0,
    });
  });

  return { attendanceRows, contexts };
}

function buildDeterministicInsight(stats: AttendanceStats, trends: TrendRow[]) {
  if (trends.length === 0) {
    return "No attendance data is tracked yet. Import attendance for an event to generate a dashboard insight.";
  }

  const first = trends[0];
  const last = trends[trends.length - 1];
  const direction =
    last.attendee_count > first.attendee_count
      ? "up"
      : last.attendee_count < first.attendee_count
        ? "down"
        : "flat";
  const topEventText = stats.top_event
    ? `${stats.top_event.title} drew the most attendees at ${stats.top_event.count}.`
    : "No single top event has emerged yet.";
  const trendText =
    direction === "flat"
      ? `Attendance stayed flat across ${stats.total_events_tracked} tracked events, averaging ${stats.avg_attendance} attendees.`
      : `Attendance moved ${direction} from ${first.attendee_count} at ${first.title} to ${last.attendee_count} at ${last.title}, across ${stats.total_events_tracked} tracked events.`;

  const recommendation =
    stats.top_event && stats.top_event.title === last.title
      ? "Recent programming is resonating, so keep the current event format and cadence."
      : "Use the strongest-attendance format as the template for the next event and test one small variation.";

  return `${trendText} ${topEventText} ${recommendation}`;
}

async function insertInsightSnapshot(ctx: MutationCtx, stats: AttendanceStats, trends: TrendRow[]) {
  return await ctx.db.insert("attendance_insights", {
    generated_at: Date.now(),
    insight_text: buildDeterministicInsight(stats, trends),
    data_snapshot: buildInsightSnapshotData(stats, trends),
    event_count: stats.total_events_tracked,
    attendee_count: stats.total_unique_attendees,
  });
}

export const recordAttendance = mutation({
  args: {
    event_id: v.id("events"),
    email: v.string(),
    name: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, { event_id, email, name, source }) => {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail.includes("@")) {
      throw new Error("A valid email is required");
    }

    const existing = await ctx.db
      .query("attendance")
      .withIndex("by_event_email", (q) => q.eq("event_id", event_id).eq("email", normalizedEmail))
      .unique();

    if (existing) {
      return existing._id;
    }

    const attendanceId = await ctx.db.insert("attendance", {
      event_id,
      email: normalizedEmail,
      name: normalizeName(name),
      checked_in_at: Date.now(),
      source,
    });

    const trends = await getAttendanceTrends.handler(ctx, {});
    const stats = await getAttendanceStats.handler(ctx, {});
    await insertInsightSnapshot(ctx, stats, trends);
    return attendanceId;
  },
});

export const importAttendanceBatch = mutation({
  args: {
    event_id: v.id("events"),
    rows: v.array(
      v.object({
        email: v.string(),
        name: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, { event_id, rows }) => {
    let imported = 0;
    let duplicates = 0;
    const seenInBatch = new Set<string>();

    for (const row of rows) {
      const email = normalizeEmail(row.email);
      if (!email || !email.includes("@")) {
        continue;
      }
      if (seenInBatch.has(email)) {
        duplicates += 1;
        continue;
      }
      seenInBatch.add(email);

      const existing = await ctx.db
        .query("attendance")
        .withIndex("by_event_email", (q) => q.eq("event_id", event_id).eq("email", email))
        .unique();

      if (existing) {
        duplicates += 1;
        continue;
      }

      await ctx.db.insert("attendance", {
        event_id,
        email,
        name: normalizeName(row.name),
        checked_in_at: Date.now(),
        source: "csv_import",
      });
      imported += 1;
    }

    if (imported > 0) {
      const trends = await getAttendanceTrends.handler(ctx, {});
      const stats = await getAttendanceStats.handler(ctx, {});
      await insertInsightSnapshot(ctx, stats, trends);
    }

    return { imported, duplicates };
  },
});

export const saveInsight = mutation({
  args: {
    insight_text: v.string(),
    data_snapshot: v.optional(v.string()),
    event_count: v.number(),
    attendee_count: v.number(),
  },
  handler: async (ctx, { insight_text, data_snapshot, event_count, attendee_count }) => {
    return await ctx.db.insert("attendance_insights", {
      generated_at: Date.now(),
      insight_text,
      data_snapshot,
      event_count,
      attendee_count,
    });
  },
});

export const getAttendanceTrends = query({
  args: {},
  handler: async (ctx) => {
    const { contexts } = await getTrackedEventContextsFromDb(ctx);
    return contexts
      .map<TrendRow>(({ event, attendeeCount }) => ({
        event_id: event._id,
        title: event.title,
        event_date: event.event_date ?? "",
        event_type: eventTypeLabel(event.event_type),
        attendee_count: attendeeCount,
      }))
      .sort((a, b) => compareDateAsc(a.event_date, b.event_date));
  },
});

export const getAttendeeProfiles = query({
  args: { min_events: v.optional(v.number()) },
  handler: async (ctx, { min_events }) => {
    const threshold = min_events ?? 0;
    const { attendanceRows, contexts } = await getTrackedEventContextsFromDb(ctx);
    const eventMap = new Map<Id<"events">, EventRow>();
    const recentEvents = contexts
      .map(({ event }) => event)
      .filter((event) => Boolean(event.event_date))
      .sort((a, b) => compareDateDesc(a.event_date, b.event_date));

    contexts.forEach(({ event }) => {
      eventMap.set(event._id, event);
    });

    const profiles = new Map<
      string,
      {
        email: string;
        name: string | null;
        eventIds: Set<Id<"events">>;
        eventTypeCounts: Map<string, number>;
        datedEvents: Array<{ id: Id<"events">; event_date: string }>;
      }
    >();

    for (const row of attendanceRows) {
      const email = normalizeEmail(row.email);
      const event = eventMap.get(row.event_id);
      if (!event) continue;

      const profile = profiles.get(email) ?? {
        email,
        name: normalizeName(row.name) ?? null,
        eventIds: new Set<Id<"events">>(),
        eventTypeCounts: new Map<string, number>(),
        datedEvents: [],
      };

      if (!profile.name && row.name) {
        profile.name = normalizeName(row.name) ?? null;
      }

      if (!profile.eventIds.has(row.event_id)) {
        profile.eventIds.add(row.event_id);
        const type = eventTypeLabel(event.event_type);
        profile.eventTypeCounts.set(type, (profile.eventTypeCounts.get(type) ?? 0) + 1);
        if (event.event_date) {
          profile.datedEvents.push({ id: row.event_id, event_date: event.event_date });
        }
      }

      profiles.set(email, profile);
    }

    return [...profiles.values()]
      .map<AttendeeProfile>((profile) => {
        const eventsAttended = profile.eventIds.size;
        const sortedDates = [...profile.datedEvents].sort((a, b) => compareDateAsc(a.event_date, b.event_date));
        const recentAttendedIds = new Set(profile.datedEvents.map((entry) => entry.id));
        const lastThreeEventIds = recentEvents.slice(0, 3).map((event) => event._id);

        let streak = 0;
        for (const event of recentEvents) {
          if (recentAttendedIds.has(event._id)) {
            streak += 1;
            continue;
          }
          break;
        }

        const sortedTypeEntries = [...profile.eventTypeCounts.entries()].sort(
          (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
        );
        const distribution: Record<string, number> = Object.fromEntries(sortedTypeEntries);
        const primaryEntry = sortedTypeEntries[0] ?? null;
        const primaryType = primaryEntry?.[0] ?? null;
        const primaryCount = primaryEntry?.[1] ?? 0;
        const primaryShare = eventsAttended > 0 ? primaryCount / eventsAttended : 0;
        const interestPrediction: InterestPrediction | null =
          eventsAttended >= 4 && primaryType
            ? {
                primary_type: primaryType,
                type_distribution: distribution,
                confidence:
                  primaryShare >= 0.6 ? "high" : primaryShare >= 0.4 ? "medium" : "low",
              }
            : null;

        return {
          email: profile.email,
          name: profile.name,
          events_attended: eventsAttended,
          first_seen: sortedDates[0]?.event_date ?? "",
          last_seen: sortedDates[sortedDates.length - 1]?.event_date ?? "",
          event_types: Object.keys(distribution),
          streak,
          is_active: lastThreeEventIds.some((eventId) => recentAttendedIds.has(eventId)),
          interest_prediction: interestPrediction,
        };
      })
      .filter((profile) => profile.events_attended >= threshold)
      .sort((a, b) => {
        if (b.events_attended !== a.events_attended) {
          return b.events_attended - a.events_attended;
        }
        return compareDateDesc(a.last_seen, b.last_seen);
      });
  },
});

export const getAttendanceStats = query({
  args: {},
  handler: async (ctx) => {
    const { attendanceRows, contexts } = await getTrackedEventContextsFromDb(ctx);
    const uniqueEmails = new Set(attendanceRows.map((row) => normalizeEmail(row.email)));
    const totalEventsTracked = contexts.length;
    const totalAttendance = contexts.reduce((sum, context) => sum + context.attendeeCount, 0);
    const avgAttendance = totalEventsTracked > 0 ? Math.round(totalAttendance / totalEventsTracked) : 0;
    const topContext = [...contexts].sort((a, b) => b.attendeeCount - a.attendeeCount)[0] ?? null;

    const stats: AttendanceStats = {
      total_events_tracked: totalEventsTracked,
      total_unique_attendees: uniqueEmails.size,
      avg_attendance: avgAttendance,
      top_event: topContext
        ? {
            title: topContext.event.title,
            count: topContext.attendeeCount,
          }
        : null,
    };
    return stats;
  },
});

export const getLatestInsight = query({
  args: {},
  handler: async (ctx) => {
    const insights = await ctx.db.query("attendance_insights").collect();
    return insights.sort((a, b) => b.generated_at - a.generated_at)[0] ?? null;
  },
});

export const refreshInsight = mutation({
  args: {},
  handler: async (ctx) => {
    const trends = await getAttendanceTrends.handler(ctx, {});
    const stats = await getAttendanceStats.handler(ctx, {});
    return await insertInsightSnapshot(ctx, stats, trends);
  },
});

export const seedDemoData = mutation({
  args: {},
  handler: async (ctx) => {
    const allEvents = await ctx.db.query("events").collect();
    const attendanceRows = await ctx.db.query("attendance").collect();
    const insights = await ctx.db.query("attendance_insights").collect();
    const eventIds: Id<"events">[] = [];
    const existingAttendanceKeys = new Set(
      attendanceRows.map((row) => `${row.event_id}:${normalizeEmail(row.email)}`)
    );
    let eventsCreated = 0;
    let attendanceImported = 0;

    for (const seed of DEMO_EVENT_SEEDS) {
      let event = allEvents.find((row) => isSameDemoEventSeed(row, seed));
      if (!event) {
        const eventId = await ctx.db.insert("events", {
          title: seed.title,
          description: seed.description,
          event_date: seed.event_date,
          event_time: seed.event_time,
          event_end_time: seed.event_end_time,
          location: seed.location,
          event_type: seed.event_type,
          target_profile: DEMO_EVENT_TARGET_PROFILE,
          needs_outreach: false,
          status: "completed",
          created_by: DEMO_EVENT_CREATED_BY,
          speaker_confirmed: true,
          room_confirmed: true,
          created_at: Date.now(),
        });
        event = await ctx.db.get(eventId);
        if (!event) {
          throw new Error("Seed event creation failed");
        }
        allEvents.push(event);
        eventsCreated += 1;
      }

      eventIds.push(event._id);
      for (const attendee of seed.attendees) {
        const email = normalizeEmail(attendee.email);
        const attendanceKey = `${event._id}:${email}`;
        if (existingAttendanceKeys.has(attendanceKey)) continue;

        await ctx.db.insert("attendance", {
          event_id: event._id,
          email,
          name: attendee.name,
          checked_in_at: Date.now(),
          source: DEMO_ATTENDANCE_SOURCE,
        });
        existingAttendanceKeys.add(attendanceKey);
        attendanceImported += 1;
      }
    }

    const latestInsight = insights.sort((a, b) => b.generated_at - a.generated_at)[0] ?? null;
    const hasDemoInsight = insights.some((insight) => isDemoInsight(insight));
    let insightId: Id<"attendance_insights"> | null = latestInsight?._id ?? null;
    if (!hasDemoInsight) {
      const trends = await getAttendanceTrends.handler(ctx, {});
      const stats = await getAttendanceStats.handler(ctx, {});
      insightId = await ctx.db.insert("attendance_insights", {
        generated_at: Date.now(),
        insight_text: buildDeterministicInsight(stats, trends),
        data_snapshot: buildInsightSnapshotData(stats, trends, {
          seed_key: DEMO_ATTENDANCE_SEED_KEY,
          source: DEMO_ATTENDANCE_SOURCE,
        }),
        event_count: stats.total_events_tracked,
        attendee_count: stats.total_unique_attendees,
      });
    }

    return {
      event_ids: eventIds,
      events_created: eventsCreated,
      attendance_imported: attendanceImported,
      insight_id: insightId,
    };
  },
});

// ⚠️ Test-only — requires ALLOW_TEST_MUTATIONS=true in Convex env vars (dev only, never prod).
export const deleteDemoData = mutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.ALLOW_TEST_MUTATIONS !== "true") {
      throw new Error("deleteDemoData is only callable in test environments");
    }

    const allEvents = await ctx.db.query("events").collect();
    const demoEvents = allEvents.filter((event) =>
      DEMO_EVENT_SEEDS.some((seed) => isSameDemoEventSeed(event, seed))
    );

    let attendanceDeleted = 0;
    for (const event of demoEvents) {
      const rows = await ctx.db
        .query("attendance")
        .withIndex("by_event", (q) => q.eq("event_id", event._id))
        .collect();
      attendanceDeleted += rows.length;
      await Promise.all(rows.map((row) => ctx.db.delete(row._id)));
      await ctx.db.delete(event._id);
    }

    const orphanedDemoAttendance = (await ctx.db.query("attendance").collect()).filter(
      (row) => row.source === DEMO_ATTENDANCE_SOURCE
    );
    attendanceDeleted += orphanedDemoAttendance.length;
    await Promise.all(orphanedDemoAttendance.map((row) => ctx.db.delete(row._id)));

    const insights = await ctx.db.query("attendance_insights").collect();
    const demoInsights = insights.filter((insight) => isDemoInsight(insight));
    await Promise.all(demoInsights.map((insight) => ctx.db.delete(insight._id)));

    return {
      events_deleted: demoEvents.length,
      attendance_deleted: attendanceDeleted,
      insights_deleted: demoInsights.length,
    };
  },
});

// ⚠️ Test-only — requires ALLOW_TEST_MUTATIONS=true in Convex env vars (dev only, never prod).
export const deleteAttendanceForEvent = mutation({
  args: { event_id: v.id("events") },
  handler: async (ctx, { event_id }) => {
    if (process.env.ALLOW_TEST_MUTATIONS !== "true") {
      throw new Error("deleteAttendanceForEvent is only callable in test environments");
    }

    const rows = await ctx.db
      .query("attendance")
      .withIndex("by_event", (q) => q.eq("event_id", event_id))
      .collect();
    await Promise.all(rows.map((row) => ctx.db.delete(row._id)));
    return rows.length;
  },
});

export const deleteInsight = mutation({
  args: { insight_id: v.id("attendance_insights") },
  handler: async (ctx, { insight_id }) => {
    if (process.env.ALLOW_TEST_MUTATIONS !== "true") {
      throw new Error("deleteInsight is only callable in test environments");
    }
    await ctx.db.delete(insight_id);
  },
});
