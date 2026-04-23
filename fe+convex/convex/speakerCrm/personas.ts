/**
 * Speaker CRM — Persona queries and mutations.
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

// ─── Bulk insert personas (called after LLM generation) ──────────────────────

export const insertPersonas = mutation({
  args: {
    eventId: v.id("speaker_events"),
    personas: v.array(
      v.object({
        label: v.string(),
        description: v.string(),
        searchTitles: v.array(v.string()),
        searchKeywords: v.array(v.string()),
        searchLocations: v.array(v.string()),
        searchCompanyTypes: v.array(v.string()),
        priority: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const ids: string[] = [];
    for (const persona of args.personas) {
      const id = await ctx.db.insert("speaker_personas", {
        eventId: args.eventId,
        ...persona,
        createdAt: now,
      });
      ids.push(id);
    }
    return ids;
  },
});

// ─── List personas for an event ───────────────────────────────────────────────

export const listPersonas = query({
  args: { eventId: v.id("speaker_events") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("speaker_personas")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(20);
  },
});

// ─── Get single ───────────────────────────────────────────────────────────────

export const getPersona = query({
  args: { personaId: v.id("speaker_personas") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.personaId);
  },
});
