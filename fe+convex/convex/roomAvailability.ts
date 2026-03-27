import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const upsertAvailability = mutation({
  args: {
    room: v.string(),
    duration_minutes: v.number(),
    slots: v.array(
      v.object({
        date: v.string(),
        day_of_week: v.string(),
        time_slot: v.string(),
        available: v.boolean(),
      })
    ),
  },
  handler: async (ctx, { room, duration_minutes, slots }) => {
    // Delete all existing rows for this room
    const existing = await ctx.db
      .query("room_availability")
      .withIndex("by_room", (q) => q.eq("room", room))
      .collect();

    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

    // Insert fresh rows
    const scraped_at = Date.now();
    for (const slot of slots) {
      await ctx.db.insert("room_availability", {
        room,
        date: slot.date,
        day_of_week: slot.day_of_week,
        time_slot: slot.time_slot,
        available: slot.available,
        duration_minutes,
        scraped_at,
      });
    }

    return { replaced: existing.length, inserted: slots.length };
  },
});

export const getAvailability = query({
  args: {
    room: v.optional(v.string()),
    from_date: v.optional(v.string()),
    to_date: v.optional(v.string()),
  },
  handler: async (ctx, { room, from_date, to_date }) => {
    let rows;
    if (room) {
      rows = await ctx.db
        .query("room_availability")
        .withIndex("by_room", (q) => q.eq("room", room))
        .collect();
    } else {
      rows = await ctx.db.query("room_availability").collect();
    }

    if (from_date) {
      rows = rows.filter((r) => r.date >= from_date);
    }
    if (to_date) {
      rows = rows.filter((r) => r.date <= to_date);
    }

    return rows;
  },
});

export const getLatestScrapeTime = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("room_availability").collect();
    if (rows.length === 0) return null;
    return Math.max(...rows.map((r) => r.scraped_at));
  },
});
