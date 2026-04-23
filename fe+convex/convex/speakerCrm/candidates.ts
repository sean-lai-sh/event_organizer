/**
 * Speaker CRM — Candidate profile + event_candidate mutations and queries.
 *
 * Deduplication: before inserting a new candidate, we check by canonicalHash.
 * If the profile already exists, we reuse it and only create a new event_candidate link.
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

// ─── Upsert a candidate profile (dedup by canonicalHash) ─────────────────────

export const upsertCandidateProfile = mutation({
  args: {
    fullName: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    headline: v.optional(v.string()),
    currentTitle: v.optional(v.string()),
    companyName: v.optional(v.string()),
    companyDomain: v.optional(v.string()),
    city: v.optional(v.string()),
    region: v.optional(v.string()),
    country: v.optional(v.string()),
    linkedinUrl: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    email: v.optional(v.string()),
    sourceSystem: v.string(),
    sourcePersonId: v.optional(v.string()),
    sourceProfileUrl: v.optional(v.string()),
    bio: v.optional(v.string()),
    publicSpeakingEvidence: v.optional(v.string()),
    topicTags: v.array(v.string()),
    industryTags: v.array(v.string()),
    audienceTags: v.array(v.string()),
    canonicalHash: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("speaker_candidates")
      .withIndex("by_canonicalHash", (q) => q.eq("canonicalHash", args.canonicalHash))
      .unique();

    if (existing) {
      // Update enrichment data if better data is available
      if (args.bio && !existing.bio) {
        await ctx.db.patch(existing._id, {
          bio: args.bio,
          publicSpeakingEvidence: args.publicSpeakingEvidence,
          topicTags: args.topicTags.length > existing.topicTags.length ? args.topicTags : existing.topicTags,
          updatedAt: Date.now(),
        });
      }
      return existing._id;
    }

    const now = Date.now();
    return await ctx.db.insert("speaker_candidates", {
      ...args,
      enrichmentStatus: "pending",
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ─── Link a candidate to an event (create event_candidate) ───────────────────

export const createEventCandidate = mutation({
  args: {
    eventId: v.id("speaker_events"),
    candidateId: v.id("speaker_candidates"),
    personaId: v.optional(v.id("speaker_personas")),
    discoveryQuery: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if already linked
    const existing = await ctx.db
      .query("speaker_event_candidates")
      .withIndex("by_candidateId", (q) => q.eq("candidateId", args.candidateId))
      .take(50);

    const alreadyLinked = existing.find((ec) => ec.eventId === args.eventId);
    if (alreadyLinked) return alreadyLinked._id;

    return await ctx.db.insert("speaker_event_candidates", {
      eventId: args.eventId,
      candidateId: args.candidateId,
      personaId: args.personaId,
      status: "sourced",
      discoveryQuery: args.discoveryQuery,
      discoveredAt: Date.now(),
    });
  },
});

// ─── Update event candidate status ───────────────────────────────────────────

export const updateEventCandidateStatus = mutation({
  args: {
    eventCandidateId: v.id("speaker_event_candidates"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.eventCandidateId, { status: args.status });
  },
});

// ─── Update candidate enrichment ─────────────────────────────────────────────

export const updateCandidateEnrichment = mutation({
  args: {
    candidateId: v.id("speaker_candidates"),
    bio: v.optional(v.string()),
    publicSpeakingEvidence: v.optional(v.string()),
    topicTags: v.array(v.string()),
    industryTags: v.array(v.string()),
    audienceTags: v.array(v.string()),
    enrichmentStatus: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.candidateId, {
      bio: args.bio,
      publicSpeakingEvidence: args.publicSpeakingEvidence,
      topicTags: args.topicTags,
      industryTags: args.industryTags,
      audienceTags: args.audienceTags,
      enrichmentStatus: args.enrichmentStatus,
      lastEnrichedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

// ─── List event candidates with profiles (for review dashboard) ───────────────

export const listEventCandidatesWithProfiles = query({
  args: {
    eventId: v.id("speaker_events"),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const q = ctx.db
      .query("speaker_event_candidates")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId));

    const eventCandidates = await q.take(200);

    // Load profiles
    const results = await Promise.all(
      eventCandidates.map(async (ec) => {
        const profile = await ctx.db.get(ec.candidateId);
        const score = await ctx.db
          .query("speaker_scores")
          .withIndex("by_eventCandidateId", (q) => q.eq("eventCandidateId", ec._id))
          .unique();
        const review = await ctx.db
          .query("speaker_review_decisions")
          .withIndex("by_eventCandidateId", (q) => q.eq("eventCandidateId", ec._id))
          .unique();
        return { eventCandidate: ec, profile, score, review };
      })
    );

    // Filter by status if requested
    if (args.status) {
      return results.filter((r) => r.eventCandidate.status === args.status);
    }

    return results;
  },
});

// ─── Get single candidate with full context ────────────────────────────────────

export const getEventCandidateDetail = query({
  args: { eventCandidateId: v.id("speaker_event_candidates") },
  handler: async (ctx, args) => {
    const ec = await ctx.db.get(args.eventCandidateId);
    if (!ec) return null;

    const [profile, score, review, persona] = await Promise.all([
      ctx.db.get(ec.candidateId),
      ctx.db
        .query("speaker_scores")
        .withIndex("by_eventCandidateId", (q) => q.eq("eventCandidateId", args.eventCandidateId))
        .unique(),
      ctx.db
        .query("speaker_review_decisions")
        .withIndex("by_eventCandidateId", (q) => q.eq("eventCandidateId", args.eventCandidateId))
        .unique(),
      ec.personaId ? ctx.db.get(ec.personaId) : null,
    ]);

    return { eventCandidate: ec, profile, score, review, persona };
  },
});
