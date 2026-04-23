/**
 * Speaker CRM — Review decision mutations and queries.
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

// ─── Submit a review decision ─────────────────────────────────────────────────

export const submitReview = mutation({
  args: {
    eventCandidateId: v.id("speaker_event_candidates"),
    decision: v.string(),       // approved | rejected | saved_later
    reasonCodes: v.array(v.string()),
    reviewerNotes: v.optional(v.string()),
    reviewedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Delete any existing decision
    const existing = await ctx.db
      .query("speaker_review_decisions")
      .withIndex("by_eventCandidateId", (q) =>
        q.eq("eventCandidateId", args.eventCandidateId)
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }

    // Insert new decision
    const decisionId = await ctx.db.insert("speaker_review_decisions", {
      eventCandidateId: args.eventCandidateId,
      decision: args.decision,
      reasonCodes: args.reasonCodes,
      reviewerNotes: args.reviewerNotes,
      reviewedBy: args.reviewedBy,
      reviewedAt: now,
    });

    // Update event_candidate status to match decision
    await ctx.db.patch(args.eventCandidateId, { status: args.decision });

    return decisionId;
  },
});

// ─── Get review for an event candidate ───────────────────────────────────────

export const getReview = query({
  args: { eventCandidateId: v.id("speaker_event_candidates") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("speaker_review_decisions")
      .withIndex("by_eventCandidateId", (q) =>
        q.eq("eventCandidateId", args.eventCandidateId)
      )
      .unique();
  },
});

// ─── List approved candidates for an event ───────────────────────────────────

export const listApprovedCandidates = query({
  args: { eventId: v.id("speaker_events") },
  handler: async (ctx, args) => {
    const approved = await ctx.db
      .query("speaker_event_candidates")
      .withIndex("by_eventId_status", (q) =>
        q.eq("eventId", args.eventId).eq("status", "approved")
      )
      .take(100);

    return await Promise.all(
      approved.map(async (ec) => {
        const [profile, score, review] = await Promise.all([
          ctx.db.get(ec.candidateId),
          ctx.db
            .query("speaker_scores")
            .withIndex("by_eventCandidateId", (q) => q.eq("eventCandidateId", ec._id))
            .unique(),
          ctx.db
            .query("speaker_review_decisions")
            .withIndex("by_eventCandidateId", (q) => q.eq("eventCandidateId", ec._id))
            .unique(),
        ]);
        // Check CRM sync status
        const crmRecord = await ctx.db
          .query("speaker_crm_record_map")
          .withIndex("by_internalEntityId", (q) =>
            q.eq("internalEntityType", "candidate").eq("internalEntityId", ec.candidateId)
          )
          .unique();

        return { eventCandidate: ec, profile, score, review, crmRecord };
      })
    );
  },
});
