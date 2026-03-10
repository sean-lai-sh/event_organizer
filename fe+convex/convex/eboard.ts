import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    return await ctx.db
      .query("eboard_members")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
  },
});

export const listActive = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("eboard_members")
      .filter((q) => q.eq(q.field("active"), true))
      .collect();
  },
});

export const upsertMember = mutation({
  args: {
    email: v.string(),
    name: v.string(),
    role: v.optional(v.string()),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("eboard_members")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { name: args.name, role: args.role, active: args.active });
      return existing._id;
    }
    return await ctx.db.insert("eboard_members", { ...args, created_at: Date.now() });
  },
});
