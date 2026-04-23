/**
 * Speaker CRM — Score mutations and queries.
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

// ─── Insert score ─────────────────────────────────────────────────────────────

export const insertScore = mutation({
  args: {
    eventCandidateId: v.id("speaker_event_candidates"),
    topicFit: v.number(),
    audienceFit: v.number(),
    credibility: v.number(),
    speakingFit: v.number(),
    accessibility: v.number(),
    brandPull: v.number(),
    locationFit: v.number(),
    budgetFit: v.number(),
    overallScore: v.number(),
    confidence: v.number(),
    strengths: v.array(v.string()),
    concerns: v.array(v.string()),
    evidenceJson: v.string(),
    rationale: v.string(),
    modelName: v.string(),
    promptVersion: v.string(),
  },
  handler: async (ctx, args) => {
    // Delete any existing score for this event candidate (re-scoring)
    const existing = await ctx.db
      .query("speaker_scores")
      .withIndex("by_eventCandidateId", (q) =>
        q.eq("eventCandidateId", args.eventCandidateId)
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }

    return await ctx.db.insert("speaker_scores", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

// ─── Get score for an event candidate ────────────────────────────────────────

export const getScore = query({
  args: { eventCandidateId: v.id("speaker_event_candidates") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("speaker_scores")
      .withIndex("by_eventCandidateId", (q) =>
        q.eq("eventCandidateId", args.eventCandidateId)
      )
      .unique();
  },
});

// ─── List ranked candidates for an event ─────────────────────────────────────
// Returns event candidates with scores, sorted by overallScore desc.

export const listRankedCandidates = query({
  args: {
    eventId: v.id("speaker_events"),
    minScore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const eventCandidates = await ctx.db
      .query("speaker_event_candidates")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(300);

    const withScores = await Promise.all(
      eventCandidates.map(async (ec) => {
        const [profile, score] = await Promise.all([
          ctx.db.get(ec.candidateId),
          ctx.db
            .query("speaker_scores")
            .withIndex("by_eventCandidateId", (q) => q.eq("eventCandidateId", ec._id))
            .unique(),
        ]);
        return { eventCandidate: ec, profile, score };
      })
    );

    // Filter by minimum score if provided
    const filtered = args.minScore
      ? withScores.filter((r) => (r.score?.overallScore ?? 0) >= args.minScore!)
      : withScores;

    // Sort by overallScore descending
    return filtered.sort(
      (a, b) => (b.score?.overallScore ?? 0) - (a.score?.overallScore ?? 0)
    );
  },
});
