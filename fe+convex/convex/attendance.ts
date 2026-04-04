import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";

type EventRow = Doc<"events">;
type AttendanceRow = Doc<"attendance">;
type AttendanceInsightRow = Doc<"attendance_insights">;

type AttendanceDashboardContext = {
  db: {
    query(table: "events"): {
      collect: () => Promise<EventRow[]>;
    };
    query(table: "attendance"): {
      collect: () => Promise<AttendanceRow[]>;
    };
    query(table: "attendance_insights"): {
      collect: () => Promise<AttendanceInsightRow[]>;
    };
  };
};

type AttendanceInput = {
  email: string;
  name?: string;
  checked_in_at?: number;
  source?: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function cleanOptionalText(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isValidEmail(email: string) {
  return email.includes("@") && !email.startsWith("@") && !email.endsWith("@");
}

function mergeAttendanceInput(previous: AttendanceInput, next: AttendanceInput): AttendanceInput {
  return {
    email: previous.email,
    name: cleanOptionalText(next.name) ?? cleanOptionalText(previous.name),
    checked_in_at: Math.min(
      previous.checked_in_at ?? Number.MAX_SAFE_INTEGER,
      next.checked_in_at ?? Number.MAX_SAFE_INTEGER
    ),
    source: cleanOptionalText(next.source) ?? cleanOptionalText(previous.source),
  };
}

function normalizeAttendanceBatch(attendees: AttendanceInput[], now: number) {
  const deduped = new Map<string, AttendanceInput>();
  let invalid_count = 0;

  for (const attendee of attendees) {
    const email = normalizeEmail(attendee.email);
    if (!isValidEmail(email)) {
      invalid_count += 1;
      continue;
    }

    const normalized: AttendanceInput = {
      email,
      name: cleanOptionalText(attendee.name),
      checked_in_at: attendee.checked_in_at ?? now,
      source: cleanOptionalText(attendee.source),
    };

    const existing = deduped.get(email);
    deduped.set(email, existing ? mergeAttendanceInput(existing, normalized) : normalized);
  }

  return {
    attendees: [...deduped.values()].map((attendee) => ({
      ...attendee,
      checked_in_at:
        attendee.checked_in_at === Number.MAX_SAFE_INTEGER ? now : attendee.checked_in_at,
    })),
    invalid_count,
  };
}

function summarizeSourceCounts(rows: AttendanceRow[]) {
  return rows.reduce<Record<string, number>>((summary, row) => {
    const key = row.source ?? "unknown";
    summary[key] = (summary[key] ?? 0) + 1;
    return summary;
  }, {});
}

function formatSourceSummary(source: string) {
  return source.replace(/_/g, " ");
}

function buildEventInsightSummary(args: {
  eventTitle: string;
  eventCountRank: number;
  totalEvents: number;
  totalCheckIns: number;
  repeatAttendeeCount: number;
  sourceCounts: Record<string, number>;
}) {
  const { eventTitle, eventCountRank, totalEvents, totalCheckIns, repeatAttendeeCount, sourceCounts } =
    args;

  if (totalCheckIns === 0) {
    return `No attendance has been recorded for ${eventTitle} yet. Use Capture to log the first entries once attendance starts coming in.`;
  }

  const sourceEntries = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]);
  const [topSource, topSourceCount] = sourceEntries[0] ?? [null, 0];
  const topSourceShare = totalCheckIns > 0 ? topSourceCount / totalCheckIns : 0;

  const turnoutLine =
    eventCountRank === 1 && totalEvents > 1
      ? "This event currently has the strongest turnout in the tracked dataset."
      : eventCountRank <= 3 && totalEvents > 3
        ? "This event sits in the stronger-attended tier of the current dataset."
        : "This event has a more focused turnout footprint in the current dataset.";

  const sourceLine = topSource
    ? topSourceShare >= 0.6
      ? `Most entries came through ${formatSourceSummary(topSource)}, suggesting that workflow is still the dominant capture path.`
      : `${formatSourceSummary(topSource)} is the largest source, but attendance capture is still spread across multiple channels.`
    : "Source mix will become clearer once more attendance is recorded.";

  const repeatLine =
    repeatAttendeeCount > 0
      ? `${repeatAttendeeCount} attendee${repeatAttendeeCount === 1 ? "" : "s"} from this event also appear in other event records.`
      : "No repeat-attendance signal is visible for this event yet.";

  return `${turnoutLine} ${sourceLine} ${repeatLine}`;
}

async function buildAttendanceDashboard(ctx: AttendanceDashboardContext) {
  const [events, attendanceRows, insightRows] = await Promise.all([
    ctx.db.query("events").collect(),
    ctx.db.query("attendance").collect(),
    ctx.db.query("attendance_insights").collect(),
  ]);

  const eventMap = new Map(events.map((event) => [event._id, event]));
  const eventBuckets = new Map<
    Id<"events">,
    {
      event_id: Id<"events">;
      title: string;
      event_date: string | null;
      attendee_count: number;
      latest_check_in_at: number | null;
      sources: Record<string, number>;
    }
  >();
  const attendeeMap = new Map<
    string,
    {
      email: string;
      name: string | null;
      event_ids: Set<Id<"events">>;
      latest_check_in_at: number;
    }
  >();

  for (const row of attendanceRows) {
    const event = eventMap.get(row.event_id);
    if (!event) continue;

    const eventBucket = eventBuckets.get(row.event_id) ?? {
      event_id: row.event_id,
      title: event.title,
      event_date: event.event_date ?? null,
      attendee_count: 0,
      latest_check_in_at: null,
      sources: {} as Record<string, number>,
    };
    eventBucket.attendee_count += 1;
    eventBucket.latest_check_in_at = Math.max(
      eventBucket.latest_check_in_at ?? 0,
      row.checked_in_at
    );
    eventBucket.sources[row.source ?? "unknown"] =
      (eventBucket.sources[row.source ?? "unknown"] ?? 0) + 1;
    eventBuckets.set(row.event_id, eventBucket);

    const attendeeBucket = attendeeMap.get(row.email) ?? {
      email: row.email,
      name: row.name ?? null,
      event_ids: new Set<Id<"events">>(),
      latest_check_in_at: row.checked_in_at,
    };
    attendeeBucket.name = row.name ?? attendeeBucket.name;
    attendeeBucket.event_ids.add(row.event_id);
    attendeeBucket.latest_check_in_at = Math.max(
      attendeeBucket.latest_check_in_at,
      row.checked_in_at
    );
    attendeeMap.set(row.email, attendeeBucket);
  }

  const latestInsight = [...insightRows]
    .sort((a, b) => b.generated_at - a.generated_at)[0] ?? null;
  const recentAttendance = [...attendanceRows]
    .sort((a, b) => b.checked_in_at - a.checked_in_at)
    .slice(0, 12)
    .map((row) => {
      const event = eventMap.get(row.event_id);
      return {
        _id: row._id,
        event_id: row.event_id,
        event_title: event?.title ?? "Unknown event",
        event_date: event?.event_date ?? null,
        email: row.email,
        name: row.name ?? null,
        checked_in_at: row.checked_in_at,
        source: row.source ?? null,
      };
    });

  const eventBreakdown = [...eventBuckets.values()].sort((a, b) => {
    if (b.attendee_count !== a.attendee_count) {
      return b.attendee_count - a.attendee_count;
    }
    return (b.latest_check_in_at ?? 0) - (a.latest_check_in_at ?? 0);
  });

  const repeatAttendees = [...attendeeMap.values()]
    .map((attendee) => ({
      email: attendee.email,
      name: attendee.name,
      event_count: attendee.event_ids.size,
      latest_check_in_at: attendee.latest_check_in_at,
    }))
    .filter((attendee) => attendee.event_count > 1)
    .sort((a, b) => {
      if (b.event_count !== a.event_count) {
        return b.event_count - a.event_count;
      }
      return b.latest_check_in_at - a.latest_check_in_at;
    })
    .slice(0, 8);

  return {
    totals: {
      events_tracked: eventBreakdown.length,
      unique_attendees: attendeeMap.size,
      total_check_ins: attendanceRows.length,
      latest_check_in_at: recentAttendance[0]?.checked_in_at ?? null,
      by_source: summarizeSourceCounts(attendanceRows),
    },
    event_breakdown: eventBreakdown,
    repeat_attendees: repeatAttendees,
    recent_attendance: recentAttendance,
    latest_insight: latestInsight
      ? {
          _id: latestInsight._id,
          generated_at: latestInsight.generated_at,
          insight_text: latestInsight.insight_text,
          data_snapshot: latestInsight.data_snapshot ?? null,
          event_count: latestInsight.event_count,
          attendee_count: latestInsight.attendee_count,
        }
      : null,
  };
}

export const upsertAttendanceBatch = mutation({
  args: {
    event_id: v.id("events"),
    attendees: v.array(
      v.object({
        email: v.string(),
        name: v.optional(v.string()),
        checked_in_at: v.optional(v.number()),
        source: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, { event_id, attendees }) => {
    const event = await ctx.db.get(event_id);
    if (!event) {
      throw new Error(`Event not found: ${event_id}`);
    }

    const now = Date.now();
    const { attendees: normalized, invalid_count } = normalizeAttendanceBatch(attendees, now);
    let inserted_count = 0;
    let updated_count = 0;

    for (const attendee of normalized) {
      const existing = await ctx.db
        .query("attendance")
        .withIndex("by_event_email", (q) =>
          q.eq("event_id", event_id).eq("email", attendee.email)
        )
        .unique();

      if (!existing) {
        await ctx.db.insert("attendance", {
          event_id,
          email: attendee.email,
          name: attendee.name,
          checked_in_at: attendee.checked_in_at ?? now,
          source: attendee.source,
        });
        inserted_count += 1;
        continue;
      }

      const nextName = attendee.name ?? existing.name;
      const nextSource = attendee.source ?? existing.source;
      const nextCheckedInAt = Math.min(
        existing.checked_in_at,
        attendee.checked_in_at ?? existing.checked_in_at
      );

      if (
        nextName !== existing.name ||
        nextSource !== existing.source ||
        nextCheckedInAt !== existing.checked_in_at
      ) {
        await ctx.db.patch(existing._id, {
          name: nextName,
          source: nextSource,
          checked_in_at: nextCheckedInAt,
        });
        updated_count += 1;
      }
    }

    return {
      event_id,
      event_title: event.title,
      processed_count: normalized.length,
      inserted_count,
      updated_count,
      invalid_count,
    };
  },
});

export const listEventAttendance = query({
  args: { event_id: v.id("events") },
  handler: async (ctx, { event_id }) => {
    const event = await ctx.db.get(event_id);
    if (!event) {
      throw new Error(`Event not found: ${event_id}`);
    }

    const attendees = await ctx.db
      .query("attendance")
      .withIndex("by_event_id", (q) => q.eq("event_id", event_id))
      .collect();

    return {
      event: {
        _id: event._id,
        title: event.title,
        event_date: event.event_date ?? null,
      },
      attendees: attendees.sort((a, b) => b.checked_in_at - a.checked_in_at),
    };
  },
});

export const getAttendanceDashboard = query({
  args: {},
  handler: async (ctx) => {
    return await buildAttendanceDashboard(ctx);
  },
});

export const getEventAttendanceDetail = query({
  args: { event_id: v.string() },
  handler: async (ctx, { event_id }) => {
    const [events, attendanceRows] = await Promise.all([
      ctx.db.query("events").collect(),
      ctx.db.query("attendance").collect(),
    ]);

    const event = events.find((candidate) => candidate._id === event_id) ?? null;

    if (!event) {
      return {
        event: null,
        summary: {
          total_check_ins: 0,
          unique_attendees: 0,
          manual_entries: 0,
          csv_imports: 0,
          latest_check_in_at: null,
          repeat_attendee_count: 0,
          source_counts: {},
        },
        insight_summary:
          "This detail link does not point to a current event record. Return to Data and reopen an event from the latest list.",
        attendees: [],
        recent_activity: [],
      };
    }

    const eventRows = attendanceRows
      .filter((row) => row.event_id === event_id)
      .sort((a, b) => b.checked_in_at - a.checked_in_at);

    const attendeeEventCounts = new Map<string, Set<Id<"events">>>();
    for (const row of attendanceRows) {
      const bucket = attendeeEventCounts.get(row.email) ?? new Set<Id<"events">>();
      bucket.add(row.event_id);
      attendeeEventCounts.set(row.email, bucket);
    }

    const uniqueAttendees = new Set(eventRows.map((row) => row.email)).size;
    const sourceCounts = summarizeSourceCounts(eventRows);
    const manualEntries = sourceCounts.manual ?? 0;
    const csvImports = sourceCounts.csv_import ?? 0;
    const repeatAttendeeCount = eventRows.filter(
      (row) => (attendeeEventCounts.get(row.email)?.size ?? 0) > 1
    ).length;

    const eventCountById = new Map<Id<"events">, number>();
    for (const row of attendanceRows) {
      eventCountById.set(row.event_id, (eventCountById.get(row.event_id) ?? 0) + 1);
    }
    const rankedEventCounts = [...eventCountById.entries()].sort((a, b) => b[1] - a[1]);
    const eventCountRank =
      rankedEventCounts.findIndex(([rankedEventId]) => rankedEventId === event_id) + 1 || 1;

    return {
      event: {
        _id: event._id,
        title: event.title,
        event_date: event.event_date ?? null,
        event_type: event.event_type ?? null,
        status: event.status ?? null,
      },
      summary: {
        total_check_ins: eventRows.length,
        unique_attendees: uniqueAttendees,
        manual_entries: manualEntries,
        csv_imports: csvImports,
        latest_check_in_at: eventRows[0]?.checked_in_at ?? null,
        repeat_attendee_count: repeatAttendeeCount,
        source_counts: sourceCounts,
      },
      insight_summary: buildEventInsightSummary({
        eventTitle: event.title,
        eventCountRank,
        totalEvents: rankedEventCounts.length,
        totalCheckIns: eventRows.length,
        repeatAttendeeCount,
        sourceCounts,
      }),
      attendees: eventRows.map((row) => ({
        _id: row._id,
        email: row.email,
        name: row.name ?? null,
        checked_in_at: row.checked_in_at,
        source: row.source ?? null,
        repeat_event_count: attendeeEventCounts.get(row.email)?.size ?? 1,
      })),
      recent_activity: eventRows.slice(0, 12).map((row) => ({
        _id: row._id,
        email: row.email,
        name: row.name ?? null,
        checked_in_at: row.checked_in_at,
        source: row.source ?? null,
      })),
    };
  },
});

export const recordAttendanceInsight = mutation({
  args: {
    insight_text: v.string(),
    data_snapshot: v.optional(v.string()),
  },
  handler: async (ctx, { insight_text, data_snapshot }) => {
    const trimmedInsight = insight_text.trim();
    if (!trimmedInsight) {
      throw new Error("Insight text is required");
    }

    const dashboard = await buildAttendanceDashboard(ctx);
    const generated_at = Date.now();
    const snapshot =
      data_snapshot ??
      JSON.stringify({
        totals: dashboard.totals,
        event_breakdown: dashboard.event_breakdown.slice(0, 5),
        repeat_attendees: dashboard.repeat_attendees.slice(0, 5),
      });

    return await ctx.db.insert("attendance_insights", {
      generated_at,
      insight_text: trimmedInsight,
      data_snapshot: snapshot,
      event_count: dashboard.totals.events_tracked,
      attendee_count: dashboard.totals.unique_attendees,
    });
  },
});
