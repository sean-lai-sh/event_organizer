import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authComponent } from "./auth";

export const getByUserId = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("eboard_members")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
  },
});

export const listActive = query({
  args: {},
  handler: async (ctx) => {
    const members = await ctx.db
      .query("eboard_members")
      .filter((q) => q.eq(q.field("active"), true))
      .collect();
    return Promise.all(
      members.map(async (m) => {
        const user = await authComponent.getAnyUserById(ctx, m.userId);
        return { ...m, name: user?.name ?? null, email: user?.email ?? null };
      })
    );
  },
});

export const upsertMember = mutation({
  args: {
    userId: v.string(),
    role: v.optional(v.string()),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("eboard_members")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { role: args.role, active: args.active });
      return existing._id;
    }
    return await ctx.db.insert("eboard_members", { ...args, created_at: Date.now() });
  },
});
