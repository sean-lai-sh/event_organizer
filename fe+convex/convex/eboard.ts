import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authComponent, safeGetAuthUser } from "./auth";
import { components } from "./_generated/api";

export const getCurrentMember = query({
  args: {},
  handler: async (ctx) => {
    const authUser = await safeGetAuthUser(ctx);
    if (!authUser) return null;
    const member = await ctx.db
      .query("eboard_members")
      .withIndex("by_userId", (q) => q.eq("userId", authUser._id))
      .first();
    if (!member) return null;
    return { ...member, name: authUser.name, email: authUser.email };
  },
});

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

/**
 * Bootstrap: promote a user to admin by email.
 * Only succeeds when no active admin exists yet.
 * Run via: npx convex run eboard:bootstrapAdmin '{"email":"you@example.com"}'
 */
export const bootstrapAdmin = mutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const allMembers = await ctx.db.query("eboard_members").collect();
    const hasAdmin = allMembers.some((m) => m.active && m.role === "admin");
    if (hasAdmin) throw new Error("An admin already exists. Bootstrap is disabled.");

    const authUser = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "email", value: email.trim().toLowerCase() }],
    });
    if (!authUser) throw new Error(`No user found with email: ${email}`);

    const existing = allMembers.find((m) => m.userId === authUser._id);
    if (existing) {
      await ctx.db.patch(existing._id, { role: "admin", active: true });
      return existing._id;
    }

    return await ctx.db.insert("eboard_members", {
      userId: authUser._id,
      role: "admin",
      active: true,
      created_at: Date.now(),
    });
  },
});

/**
 * Set role for a member by Better Auth user id.
 * If no admin exists yet, an authenticated user may set themselves to admin.
 * Once an admin exists, only admins can set roles.
 */
export const setRole = mutation({
  args: {
    userId: v.string(),
    role: v.string(),
  },
  handler: async (ctx, { userId, role }) => {
    const authUser = await safeGetAuthUser(ctx);
    if (!authUser) throw new Error("Not authenticated");

    const [actorMember, targetMember, allMembers] = await Promise.all([
      ctx.db
        .query("eboard_members")
        .withIndex("by_userId", (q) => q.eq("userId", authUser._id))
        .first(),
      ctx.db
        .query("eboard_members")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first(),
      ctx.db.query("eboard_members").collect(),
    ]);

    if (!actorMember || !actorMember.active) {
      throw new Error("Only active members can assign roles");
    }
    if (!targetMember) throw new Error("Target member not found");

    const hasAdmin = allMembers.some((m) => m.active && m.role === "admin");
    if (!hasAdmin) {
      const selfBootstrap = userId === authUser._id && role === "admin";
      if (!selfBootstrap) {
        throw new Error("First role assignment must set yourself as admin");
      }
    } else if (actorMember.role !== "admin") {
      throw new Error("Only admins can assign roles");
    }

    await ctx.db.patch(targetMember._id, { role });
    return targetMember._id;
  },
});
