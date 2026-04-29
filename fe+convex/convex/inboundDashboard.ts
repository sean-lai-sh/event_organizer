import { v } from "convex/values";
import { query } from "./_generated/server";
import { authComponent } from "./auth";

const inboundStateFilterValidator = v.union(
  v.literal("all"),
  v.literal("needs_review"),
  v.literal("awaiting_member_reply"),
  v.literal("resolved")
);

function normalizeInboundState(value?: string | null) {
  return value ?? "needs_review";
}

function formatInboundStateLabel(state?: string | null) {
  const normalized = normalizeInboundState(state);
  if (normalized === "awaiting_member_reply") return "Awaiting Reply";
  if (normalized === "resolved") return "Resolved";
  return "Needs Review";
}

function getLastActivityAt(
  row: {
    last_inbound_at?: number | null;
    created_at: number;
  },
  receipts: Array<{
    received_at: number;
  }>
) {
  const latestReceiptAt = receipts.reduce(
    (latest, receipt) => Math.max(latest, receipt.received_at),
    0
  );
  return row.last_inbound_at ?? (latestReceiptAt || row.created_at);
}

function summarizeOutreach(rows: Array<Record<string, unknown>>) {
  return {
    threads: rows.length,
    inbound_messages: rows.reduce((sum, row) => sum + Number(row.inbound_count ?? 0), 0),
    accepted: rows.filter((row) => row.response === "accepted").length,
    declined: rows.filter((row) => row.response === "declined").length,
    pending: rows.filter((row) => !row.response || row.response === "pending").length,
    needs_review: rows.filter((row) => row.inbound_state === "needs_review").length,
    awaiting_member_reply: rows.filter((row) => row.inbound_state === "awaiting_member_reply").length,
    resolved: rows.filter((row) => row.inbound_state === "resolved").length,
  };
}

export const listOutreachThreads = query({
  args: {
    filter: v.optional(inboundStateFilterValidator),
  },
  handler: async (ctx, { filter }) => {
    const rows = await ctx.db.query("event_outreach").collect();

    const filteredRows = rows.filter((row) => {
      if (!filter || filter === "all") return true;
      return normalizeInboundState(row.inbound_state) === filter;
    });

    const threadRows = await Promise.all(
      filteredRows.map(async (row) => {
        const [event, threadReceipts] = await Promise.all([
          ctx.db.get(row.event_id),
          row.agentmail_thread_id
            ? ctx.db
                .query("inbound_receipts")
                .withIndex("by_thread_id", (q) =>
                  q.eq("thread_id", row.agentmail_thread_id)
                )
                .collect()
            : Promise.resolve([]),
        ]);
        const lastActivityAt = getLastActivityAt(row, threadReceipts);
        return {
          _id: row._id,
          attio_record_id: row.attio_record_id,
          attio_speakers_entry_id: row.attio_speakers_entry_id ?? null,
          response: row.response ?? "pending",
          inbound_state: normalizeInboundState(row.inbound_state),
          inbound_state_label: formatInboundStateLabel(row.inbound_state),
          event_id: row.event_id,
          event_name: event?.title ?? "Untitled event",
          contact_name: row.contact_name ?? null,
          contact_email: row.contact_email ?? null,
          contact_identifier:
            row.contact_name ?? row.contact_email ?? row.attio_record_id,
          message_count: row.inbound_count ?? threadReceipts.length,
          last_activity_at: lastActivityAt,
        };
      })
    );

    return threadRows.sort((left, right) => right.last_activity_at - left.last_activity_at);
  },
});

export const getOutreachThread = query({
  args: {
    id: v.id("event_outreach"),
  },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (!row) return null;

    const [event, rawReceipts] = await Promise.all([
      ctx.db.get(row.event_id),
      row.agentmail_thread_id
        ? ctx.db
            .query("inbound_receipts")
            .withIndex("by_thread_id", (q) =>
              q.eq("thread_id", row.agentmail_thread_id)
            )
            .collect()
        : Promise.resolve([]),
    ]);

    const threadReceipts = row.agentmail_thread_id
      ? rawReceipts.sort((left, right) => {
            const timeDelta = left.received_at - right.received_at;
            if (timeDelta !== 0) return timeDelta;
            const updatedLeft = left.updated_at ?? left.completed_at ?? left.processing_started_at ?? 0;
            const updatedRight =
              right.updated_at ?? right.completed_at ?? right.processing_started_at ?? 0;
            if (updatedLeft !== updatedRight) return updatedLeft - updatedRight;
            return left.message_id.localeCompare(right.message_id);
          })
      : [];

    return {
      ...row,
      attio_speakers_entry_id: row.attio_speakers_entry_id ?? null,
      contact_name: row.contact_name ?? null,
      contact_email: row.contact_email ?? null,
      contact_identifier: row.contact_name ?? row.contact_email ?? row.attio_record_id,
      inbound_state: normalizeInboundState(row.inbound_state),
      inbound_state_label: formatInboundStateLabel(row.inbound_state),
      message_count: row.inbound_count ?? threadReceipts.length,
      last_activity_at: getLastActivityAt(row, threadReceipts),
      event: event
        ? {
            _id: event._id,
            title: event.title,
            event_date: event.event_date ?? null,
            event_time: event.event_time ?? null,
            status: event.status,
          }
        : null,
      receipts: threadReceipts,
    };
  },
});

export const getEventInboundStatus = query({
  args: { event_id: v.optional(v.id("events")) },
  handler: async (ctx, { event_id }) => {
    const events = event_id
      ? [await ctx.db.get(event_id)].filter(Boolean)
      : await ctx.db.query("events").order("desc").collect();

    return await Promise.all(
      events.map(async (event) => {
        if (!event) return null;
        const outreachRows = await ctx.db
          .query("event_outreach")
          .withIndex("by_event_id", (q) => q.eq("event_id", event._id))
          .collect();

        return {
          event_id: event._id,
          title: event.title,
          status: event.status,
          event_date: event.event_date ?? null,
          speaker_confirmed: event.speaker_confirmed ?? false,
          room_confirmed: event.room_confirmed ?? false,
          summary: summarizeOutreach(outreachRows),
          threads: outreachRows.map((row) => ({
            attio_record_id: row.attio_record_id,
            response: row.response ?? "pending",
            inbound_state: row.inbound_state ?? "needs_review",
            inbound_count: row.inbound_count ?? 0,
            last_inbound_at: row.last_inbound_at ?? null,
            last_inbound_from: row.last_inbound_from ?? null,
            last_classification: row.last_classification ?? null,
          })),
        };
      })
    ).then((rows) => rows.filter(Boolean));
  },
});

export const getMemberInboundSummary = query({
  args: {},
  handler: async (ctx) => {
    const members = await ctx.db
      .query("eboard_members")
      .filter((q) => q.eq(q.field("active"), true))
      .collect();

    return await Promise.all(
      members.map(async (member) => {
        const user = await authComponent.getAnyUserById(ctx, member.userId);
        const assignments = await ctx.db
          .query("contact_assignments")
          .withIndex("by_member_id", (q) => q.eq("memberId", member._id))
          .collect();
        const uniqueAttio = Array.from(new Set(assignments.map((a) => a.attio_record_id)));

        const outreachRows = (
          await Promise.all(
            uniqueAttio.map(async (attio_record_id) =>
              await ctx.db
                .query("event_outreach")
                .withIndex("by_attio_record_id", (q) => q.eq("attio_record_id", attio_record_id))
                .collect()
            )
          )
        ).flat();

        return {
          member_id: member._id,
          name: user?.name ?? null,
          email: user?.email ?? null,
          role: member.role ?? null,
          assigned_contacts: uniqueAttio.length,
          summary: summarizeOutreach(outreachRows),
        };
      })
    );
  },
});
