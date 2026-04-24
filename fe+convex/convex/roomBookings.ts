import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Return the latest OnceHub (or other provider) booking record for an event,
 * or null if no booking exists. Read-only; callable by the Modal runtime via
 * the Convex deploy key.
 */
export const getEventRoomBooking = query({
  args: { event_id: v.id("events") },
  handler: async (ctx, { event_id }) => {
    const rows = await ctx.db
      .query("event_room_bookings")
      .withIndex("by_event_id", (q) => q.eq("event_id", event_id))
      .collect();

    if (rows.length === 0) return null;

    // Return the most recently updated one, so a retry that overwrites an
    // earlier "failed" row still returns the latest "confirmed" record.
    return rows.reduce((latest, row) =>
      row.updated_at > latest.updated_at ? row : latest
    );
  },
});

/**
 * Upsert the booking record for an event and flip `events.room_confirmed` true
 * when the booking status is "confirmed". Callable by the Modal agent runtime
 * after an approved OnceHub write.
 *
 * Sticky semantics on `events.room_confirmed`: we only ever set it to true,
 * never back to false, matching `events.applyInboundMilestones`.
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

    const existingRows = await ctx.db
      .query("event_room_bookings")
      .withIndex("by_event_id", (q) => q.eq("event_id", args.event_id))
      .collect();

    const existing = existingRows.find(
      (row) =>
        row.provider === args.provider &&
        row.slot_start_epoch_ms === args.slot_start_epoch_ms
    );

    const now = Date.now();
    let bookingId;
    if (existing) {
      await ctx.db.patch(existing._id, {
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
