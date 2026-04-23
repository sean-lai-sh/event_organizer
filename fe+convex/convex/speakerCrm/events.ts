/**
 * Speaker CRM — Event queries and mutations.
 *
 * Manages speaker_events (the CRM event briefs, separate from operational events).
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

// ─── Create ───────────────────────────────────────────────────────────────────

export const createSpeakerEvent = mutation({
  args: {
    name: v.string(),
    eventType: v.string(),
    description: v.string(),
    audienceSummary: v.string(),
    audienceSize: v.number(),
    locationCity: v.string(),
    locationRegion: v.string(),
    dateWindowStart: v.string(),
    dateWindowEnd: v.string(),
    themeTags: v.array(v.string()),
    mustHaveTags: v.array(v.string()),
    niceToHaveTags: v.array(v.string()),
    exclusionTags: v.array(v.string()),
    budgetTier: v.string(),
    targetCandidateCount: v.number(),
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const eventId = await ctx.db.insert("speaker_events", {
      ...args,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
    return eventId;
  },
});

// ─── Update status ────────────────────────────────────────────────────────────

export const updateSpeakerEventStatus = mutation({
  args: {
    eventId: v.id("speaker_events"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.eventId, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

// ─── List ─────────────────────────────────────────────────────────────────────

export const listSpeakerEvents = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("speaker_events")
      .withIndex("by_createdAt")
      .order("desc")
      .take(50);
  },
});

// ─── Get single ───────────────────────────────────────────────────────────────

export const getSpeakerEvent = query({
  args: { eventId: v.id("speaker_events") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.eventId);
  },
});

// ─── Pipeline counts (for progress display) ───────────────────────────────────

export const getSpeakerEventCounts = query({
  args: { eventId: v.id("speaker_events") },
  handler: async (ctx, args) => {
    const personas = await ctx.db
      .query("speaker_personas")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(100);

    const allEventCandidates = await ctx.db
      .query("speaker_event_candidates")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500);

    const scored = allEventCandidates.filter((ec) =>
      ["scored", "approved", "rejected", "saved_later"].includes(ec.status)
    );
    const approved = allEventCandidates.filter((ec) => ec.status === "approved");
    const rejected = allEventCandidates.filter((ec) => ec.status === "rejected");

    // Count synced CRM records for this event's approved candidates
    const syncedCount = await ctx.db
      .query("speaker_crm_record_map")
      .withIndex("by_internalEntityId", (q) =>
        q.eq("internalEntityType", "event").eq("internalEntityId", args.eventId)
      )
      .take(100);

    return {
      personaCount: personas.length,
      candidateCount: allEventCandidates.length,
      scoredCount: scored.length,
      approvedCount: approved.length,
      rejectedCount: rejected.length,
      syncedCount: syncedCount.length,
    };
  },
});
