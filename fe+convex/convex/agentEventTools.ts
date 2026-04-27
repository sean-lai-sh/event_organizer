import { v } from "convex/values";
import { mutation } from "./_generated/server";

const EVENT_STATUS_VALUES = new Set(["draft", "matching", "outreach", "completed"]);

function validateEventStatus(status: string) {
  if (!EVENT_STATUS_VALUES.has(status)) {
    throw new Error(
      `Invalid event status: ${status}. Expected one of ${Array.from(EVENT_STATUS_VALUES).join(", ")}`
    );
  }
}

export const createEventSafe = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    event_date: v.optional(v.string()),
    event_time: v.optional(v.string()),
    event_end_time: v.optional(v.string()),
    location: v.optional(v.string()),
    event_type: v.optional(v.string()),
    target_profile: v.optional(v.string()),
    needs_outreach: v.optional(v.boolean()),
    status: v.optional(v.string()),
    created_by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const status = args.status ?? "draft";
    validateEventStatus(status);

    const event: {
      title: string;
      description?: string;
      event_date?: string;
      event_time?: string;
      event_end_time?: string;
      location?: string;
      event_type?: string;
      target_profile?: string;
      needs_outreach: boolean;
      status: string;
      created_by?: string;
      speaker_confirmed: boolean;
      room_confirmed: boolean;
      created_at: number;
    } = {
      title: args.title,
      needs_outreach: args.needs_outreach ?? false,
      status,
      speaker_confirmed: false,
      room_confirmed: false,
      created_at: Date.now(),
    };
    if (args.description !== undefined) event.description = args.description;
    if (args.event_date !== undefined) event.event_date = args.event_date;
    if (args.event_time !== undefined) event.event_time = args.event_time;
    if (args.event_end_time !== undefined) event.event_end_time = args.event_end_time;
    if (args.location !== undefined) event.location = args.location;
    if (args.event_type !== undefined) event.event_type = args.event_type;
    if (args.target_profile !== undefined) event.target_profile = args.target_profile;
    if (args.created_by !== undefined) event.created_by = args.created_by;

    return await ctx.db.insert("events", event);
  },
});

export const updateEventSafe = mutation({
  args: {
    event_id: v.id("events"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    event_date: v.optional(v.string()),
    event_time: v.optional(v.string()),
    event_end_time: v.optional(v.string()),
    location: v.optional(v.string()),
    status: v.optional(v.string()),
    event_type: v.optional(v.string()),
    target_profile: v.optional(v.string()),
    needs_outreach: v.optional(v.boolean()),
    speaker_confirmed: v.optional(v.boolean()),
    room_confirmed: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    {
      event_id,
      title,
      description,
      event_date,
      event_time,
      event_end_time,
      location,
      status,
      event_type,
      target_profile,
      needs_outreach,
      speaker_confirmed,
      room_confirmed,
    }
  ) => {
    const event = await ctx.db.get(event_id);
    if (!event) {
      throw new Error(`Event not found: ${event_id}`);
    }

    const patch: Record<string, unknown> = {};
    if (title !== undefined) patch.title = title;
    if (description !== undefined) patch.description = description;
    if (event_date !== undefined) patch.event_date = event_date;
    if (event_time !== undefined) patch.event_time = event_time;
    if (event_end_time !== undefined) patch.event_end_time = event_end_time;
    if (location !== undefined) patch.location = location;
    if (status !== undefined) {
      validateEventStatus(status);
      patch.status = status;
    }
    if (event_type !== undefined) patch.event_type = event_type;
    if (target_profile !== undefined) patch.target_profile = target_profile;
    if (needs_outreach !== undefined) patch.needs_outreach = needs_outreach;

    // Sticky milestone semantics: runtime updates can only turn milestones on.
    if (speaker_confirmed === true && event.speaker_confirmed !== true) {
      patch.speaker_confirmed = true;
    }
    if (room_confirmed === true && event.room_confirmed !== true) {
      patch.room_confirmed = true;
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(event_id, patch);
    }

    return await ctx.db.get(event_id);
  },
});
