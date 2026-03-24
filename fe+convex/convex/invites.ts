import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authComponent, getAuthUser, safeGetAuthUser } from "./auth";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Check if an invite code is valid (unused, not expired). Safe to call unauthenticated. */
export const validate = query({
  args: {
    code: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, { code, email }) => {
    const normalizedCode = normalizeCode(code);
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_code", (q) => q.eq("code", normalizedCode))
      .first();
    if (!invite) return { valid: false, reason: "Invalid invite code" };
    if (invite.used_at || invite.used_by || invite.used_email) {
      return { valid: false, reason: "Invite code already used" };
    }
    if (invite.expires_at && invite.expires_at < Date.now())
      return { valid: false, reason: "Invite code expired" };

    if (invite.invited_email && email) {
      if (normalizeEmail(invite.invited_email) !== normalizeEmail(email)) {
        return { valid: false, reason: "Invite code is bound to a different email" };
      }
    }
    return { valid: true, invited_email: invite.invited_email ?? null };
  },
});

/** Mark an invite code as used. Call this after successful signup. */
export const consume = mutation({
  args: {
    code: v.string(),
    email: v.string(),
  },
  handler: async (ctx, { code, email }) => {
    const normalizedCode = normalizeCode(code);
    const normalizedEmail = normalizeEmail(email);
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_code", (q) => q.eq("code", normalizedCode))
      .first();
    if (!invite) throw new Error("Invalid invite code");
    if (invite.used_at || invite.used_by || invite.used_email) {
      throw new Error("Invite code already used");
    }
    if (invite.expires_at && invite.expires_at < Date.now())
      throw new Error("Invite code expired");
    if (
      invite.invited_email &&
      normalizeEmail(invite.invited_email) !== normalizedEmail
    ) {
      throw new Error("Invite code is bound to a different email");
    }

    const user = await safeGetAuthUser(ctx);

    await ctx.db.patch(invite._id, {
      used_by: user?._id,
      used_email: normalizedEmail,
      used_at: Date.now(),
    });
  },
});

/** Create a new invite code. Requires an authenticated eboard member. */
export const create = mutation({
  args: {
    code: v.optional(v.string()),
    invited_email: v.optional(v.string()),
    expires_at: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const code = normalizeCode(args.code ?? generateCode());
    const invitedEmail = args.invited_email
      ? normalizeEmail(args.invited_email)
      : undefined;

    const existing = await ctx.db
      .query("invites")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (existing) throw new Error("Invite code already exists");

    await ctx.db.insert("invites", {
      code,
      invited_email: invitedEmail,
      created_by: user._id,
      expires_at: args.expires_at,
      created_at: Date.now(),
    });
    return code;
  },
});

/** List invite codes for dashboard management. Requires authentication. */
export const list = query({
  args: {
    includeUsed: v.optional(v.boolean()),
  },
  handler: async (ctx, { includeUsed }) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const invites = await ctx.db.query("invites").collect();
    const filtered = includeUsed
      ? invites
      : invites.filter((invite) => !invite.used_by);
    const sorted = filtered.sort((a, b) => b.created_at - a.created_at);

    return Promise.all(
      sorted.map(async (invite) => {
        const [creator, consumer] = await Promise.all([
          invite.created_by
            ? authComponent.getAnyUserById(ctx, invite.created_by)
            : Promise.resolve(null),
          invite.used_by
            ? authComponent.getAnyUserById(ctx, invite.used_by)
            : Promise.resolve(null),
        ]);

        return {
          ...invite,
          created_by_email: creator?.email ?? null,
          created_by_name: creator?.name ?? null,
          used_by_email: consumer?.email ?? null,
          used_by_name: consumer?.name ?? null,
        };
      })
    );
  },
});

/**
 * Seed the very first admin invite code. Only succeeds when no invites exist yet.
 * Run once via `npx convex run invites:seedAdminInvite` to bootstrap the first account.
 * Optionally pass a custom code, otherwise defaults to a random 8-char code.
 */
export const seedAdminInvite = mutation({
  args: { code: v.optional(v.string()) },
  handler: async (ctx, { code }) => {
    const existing = await ctx.db.query("invites").first();
    if (existing) {
      throw new Error(
        "Invites already exist. Use invites:create from an authenticated session instead."
      );
    }

    const inviteCode = normalizeCode(code ?? generateCode());
    await ctx.db.insert("invites", {
      code: inviteCode,
      created_at: Date.now(),
    });
    console.log(`Admin invite created: ${inviteCode}`);
    return inviteCode;
  },
});
