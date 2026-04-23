/**
 * Speaker CRM — CRM sync record mutations and queries.
 *
 * Tracks which candidates have been synced to HubSpot (or other CRMs).
 * The actual API calls happen in the Next.js API route; this module just
 * persists the mapping.
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

// ─── Record a successful sync ─────────────────────────────────────────────────

export const recordCRMSync = mutation({
  args: {
    internalEntityType: v.string(), // "candidate" | "event"
    internalEntityId: v.string(),
    crmSystem: v.string(),           // "hubspot"
    crmObjectType: v.string(),       // "contact"
    crmRecordId: v.string(),
  },
  handler: async (ctx, args) => {
    // Upsert by internal entity
    const existing = await ctx.db
      .query("speaker_crm_record_map")
      .withIndex("by_internalEntityId", (q) =>
        q
          .eq("internalEntityType", args.internalEntityType)
          .eq("internalEntityId", args.internalEntityId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        crmRecordId: args.crmRecordId,
        syncedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("speaker_crm_record_map", {
      ...args,
      syncedAt: Date.now(),
    });
  },
});

// ─── Get sync record for a candidate ─────────────────────────────────────────

export const getCRMRecord = query({
  args: {
    internalEntityType: v.string(),
    internalEntityId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("speaker_crm_record_map")
      .withIndex("by_internalEntityId", (q) =>
        q
          .eq("internalEntityType", args.internalEntityType)
          .eq("internalEntityId", args.internalEntityId)
      )
      .unique();
  },
});

// ─── List all sync records for an event's approved candidates ─────────────────

export const listEventSyncRecords = query({
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
        const [profile, crmRecord] = await Promise.all([
          ctx.db.get(ec.candidateId),
          ctx.db
            .query("speaker_crm_record_map")
            .withIndex("by_internalEntityId", (q) =>
              q.eq("internalEntityType", "candidate").eq("internalEntityId", ec.candidateId)
            )
            .unique(),
        ]);
        return { eventCandidate: ec, profile, crmRecord };
      })
    );
  },
});
