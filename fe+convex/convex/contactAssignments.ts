import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { authComponent } from "./auth";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const resolveAssigneesByRecord = query({
  args: { attio_record_id: v.string() },
  handler: async (ctx, { attio_record_id }) => {
    const rows = await ctx.db
      .query("contact_assignments")
      .withIndex("by_record_id", (q) => q.eq("attio_record_id", attio_record_id))
      .collect();

    const deduped = new Map<string, (typeof rows)[number]>();
    for (const row of rows) deduped.set(row.memberId, row);

    return await Promise.all(
      Array.from(deduped.values()).map(async (row) => {
        const member = await ctx.db.get(row.memberId);
        const user = member ? await authComponent.getAnyUserById(ctx, member.userId) : null;
        return {
          memberId: row.memberId,
          assigned_at: row.assigned_at,
          role: member?.role ?? null,
          active: member?.active ?? false,
          userId: member?.userId ?? null,
          name: user?.name ?? null,
          email: user?.email ?? null,
        };
      })
    );
  },
});

export const upsertAssignmentsByMemberIds = mutation({
  args: {
    attio_record_id: v.string(),
    memberIds: v.array(v.id("eboard_members")),
  },
  handler: async (ctx, { attio_record_id, memberIds }) => {
    const target = new Set(memberIds as Id<"eboard_members">[]);
    const existing = await ctx.db
      .query("contact_assignments")
      .withIndex("by_record_id", (q) => q.eq("attio_record_id", attio_record_id))
      .collect();

    const existingByMember = new Map(existing.map((row) => [row.memberId, row]));
    const now = Date.now();
    let inserted = 0;
    let removed = 0;

    for (const row of existing) {
      if (!target.has(row.memberId)) {
        await ctx.db.delete(row._id);
        removed += 1;
      }
    }
    for (const memberId of target) {
      if (!existingByMember.has(memberId)) {
        await ctx.db.insert("contact_assignments", {
          attio_record_id,
          memberId,
          assigned_at: now,
        });
        inserted += 1;
      }
    }

    return { inserted, removed, total: target.size };
  },
});

export const upsertAssignmentsByEmails = mutation({
  args: {
    attio_record_id: v.string(),
    emails: v.array(v.string()),
  },
  handler: async (ctx, { attio_record_id, emails }) => {
    const normalized = Array.from(new Set(emails.map(normalizeEmail).filter(Boolean)));

    const activeMembers = await ctx.db
      .query("eboard_members")
      .filter((q) => q.eq(q.field("active"), true))
      .collect();

    const emailToMemberId = new Map<string, Id<"eboard_members">>();
    for (const member of activeMembers) {
      const user = await authComponent.getAnyUserById(ctx, member.userId);
      const email = user?.email ? normalizeEmail(user.email) : null;
      if (email) emailToMemberId.set(email, member._id);
    }

    const resolvedMemberIds = normalized
      .map((email) => emailToMemberId.get(email))
      .filter((v): v is Id<"eboard_members"> => Boolean(v));

    const unresolvedEmails = normalized.filter((email) => !emailToMemberId.has(email));
    const result = await (async () => {
      const target = new Set(resolvedMemberIds);
      const existing = await ctx.db
        .query("contact_assignments")
        .withIndex("by_record_id", (q) => q.eq("attio_record_id", attio_record_id))
        .collect();
      const existingByMember = new Map(existing.map((row) => [row.memberId, row]));

      let inserted = 0;
      let removed = 0;
      for (const row of existing) {
        if (!target.has(row.memberId)) {
          await ctx.db.delete(row._id);
          removed += 1;
        }
      }
      for (const memberId of target) {
        if (!existingByMember.has(memberId)) {
          await ctx.db.insert("contact_assignments", {
            attio_record_id,
            memberId,
            assigned_at: Date.now(),
          });
          inserted += 1;
        }
      }
      return { inserted, removed, total: target.size };
    })();

    return { ...result, unresolvedEmails };
  },
});
