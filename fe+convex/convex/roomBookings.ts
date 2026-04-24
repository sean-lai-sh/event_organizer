import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdminMember } from "./eboard";

export const getEventRoomBooking = query({
  args: { event_id: v.id("events") },
  handler: async (ctx, { event_id }) => {
    const row = await ctx.db
      .query("event_room_bookings")
      .withIndex("by_event_id", (q) => q.eq("event_id", event_id))
      .order("desc")
      .first();
    return row ?? null;
  },
});

// Upsert the latest OnceHub booking receipt for a given event and mark the
// event's room milestone confirmed. One row per event: existing rows are
// patched in place; the first booking inserts a new row.
export const upsertEventRoomBooking = mutation({
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
    await requireAdminMember(ctx);

    const event = await ctx.db.get(args.event_id);
    if (!event) {
      throw new Error(`Event not found: ${args.event_id}`);
    }

    const existing = await ctx.db
      .query("event_room_bookings")
      .withIndex("by_event_id", (q) => q.eq("event_id", args.event_id))
      .first();

    const now = Date.now();
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
    } else {
      await ctx.db.insert("event_room_bookings", {
        ...args,
        created_at: now,
        updated_at: now,
      });
    }

    // Sticky milestone: once a booking lands, room_confirmed stays true.
    if (event.room_confirmed !== true) {
      await ctx.db.patch(args.event_id, { room_confirmed: true });
    }

    return { event_id: args.event_id };
  },
});
