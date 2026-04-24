import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";

type BookingPublic = {
  _id: Doc<"event_room_bookings">["_id"];
  event_id: Doc<"event_room_bookings">["event_id"];
  provider: string;
  page_url: string;
  link_name: string;
  room_label: string;
  booking_status: string;
  booked_date: string;
  booked_time: string;
  booked_end_time: string;
  duration_minutes: number;
  slot_start_epoch_ms: number;
  booking_reference?: string;
  approver_user_id?: string;
  created_at: number;
  updated_at: number;
};

function toPublic(row: Doc<"event_room_bookings">): BookingPublic {
  // Deliberately omits `raw_response_json` and `booking_reference_json` —
  // those are audit-only blobs and should not be exposed to web clients.
  return {
    _id: row._id,
    event_id: row.event_id,
    provider: row.provider,
    page_url: row.page_url,
    link_name: row.link_name,
    room_label: row.room_label,
    booking_status: row.booking_status,
    booked_date: row.booked_date,
    booked_time: row.booked_time,
    booked_end_time: row.booked_end_time,
    duration_minutes: row.duration_minutes,
    slot_start_epoch_ms: row.slot_start_epoch_ms,
    booking_reference: row.booking_reference,
    approver_user_id: row.approver_user_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Return the latest OnceHub (or other provider) booking record for an event,
 * or null if no booking exists. Uses the `by_event_updated` compound index
 * so the query reads a single row per event instead of scanning history.
 * Returns only the safe subset of fields — raw provider payloads stay in
 * storage for audit but never leave the query boundary.
 */
export const getEventRoomBooking = query({
  args: { event_id: v.id("events") },
  handler: async (ctx, { event_id }) => {
    const latest = await ctx.db
      .query("event_room_bookings")
      .withIndex("by_event_updated", (q) => q.eq("event_id", event_id))
      .order("desc")
      .first();
    return latest ? toPublic(latest) : null;
  },
});

/**
 * Upsert the booking record for an event and flip `events.room_confirmed` true
 * when the booking status is "confirmed". Callable by the Modal agent runtime
 * after an approved OnceHub write.
 *
 * Sticky semantics on `events.room_confirmed`: we only ever set it to true,
 * never back to false, matching `events.applyInboundMilestones`.
 *
 * NOTE: This is a public mutation (same pattern as the rest of the
 * agent-written Convex tables in this repo). Hardening agent writes behind
 * a dedicated service-auth guard is tracked in issue #36; once that lands,
 * this mutation should adopt the same guard.
 */
export const upsertFromAgent = mutation({
  args: {
    event_id: v.id("events"),
    provider: v.string(),
    page_url: v.string(),
    link_name: v.string(),
    room_label: v.string(),
    booking_status: v.string(),
    booked_date: v.string(),
    booked_time: v.string(),
    booked_end_time: v.string(),
    duration_minutes: v.number(),
    slot_start_epoch_ms: v.number(),
    booking_reference: v.optional(v.string()),
    booking_reference_json: v.optional(v.string()),
    approver_user_id: v.optional(v.string()),
    raw_response_json: v.string(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.event_id);
    if (!event) {
      throw new Error(`Event not found: ${args.event_id}`);
    }

    const existing = await ctx.db
      .query("event_room_bookings")
      .withIndex("by_event_slot", (q) =>
        q
          .eq("event_id", args.event_id)
          .eq("provider", args.provider)
          .eq("slot_start_epoch_ms", args.slot_start_epoch_ms)
      )
      .first();

    const now = Date.now();
    let bookingId;
    if (existing) {
      await ctx.db.patch(existing._id, {
        page_url: args.page_url,
        link_name: args.link_name,
        room_label: args.room_label,
        booking_status: args.booking_status,
        booked_date: args.booked_date,
        booked_time: args.booked_time,
        booked_end_time: args.booked_end_time,
        duration_minutes: args.duration_minutes,
        booking_reference: args.booking_reference,
        booking_reference_json: args.booking_reference_json,
        approver_user_id: args.approver_user_id,
        raw_response_json: args.raw_response_json,
        updated_at: now,
      });
      bookingId = existing._id;
    } else {
      bookingId = await ctx.db.insert("event_room_bookings", {
        event_id: args.event_id,
        provider: args.provider,
        page_url: args.page_url,
        link_name: args.link_name,
        room_label: args.room_label,
        booking_status: args.booking_status,
        booked_date: args.booked_date,
        booked_time: args.booked_time,
        booked_end_time: args.booked_end_time,
        duration_minutes: args.duration_minutes,
        slot_start_epoch_ms: args.slot_start_epoch_ms,
        booking_reference: args.booking_reference,
        booking_reference_json: args.booking_reference_json,
        approver_user_id: args.approver_user_id,
        raw_response_json: args.raw_response_json,
        created_at: now,
        updated_at: now,
      });
    }

    // Flip the sticky room_confirmed flag on the event only when the booking
    // actually confirmed. Do NOT auto-revert.
    if (args.booking_status === "confirmed" && event.room_confirmed !== true) {
      await ctx.db.patch(args.event_id, { room_confirmed: true });
    }

    return bookingId;
  },
});
