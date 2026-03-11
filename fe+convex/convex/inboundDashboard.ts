import { v } from "convex/values";
import { query } from "./_generated/server";
import { authComponent } from "./auth";

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
