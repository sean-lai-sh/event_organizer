import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";

const convexSiteUrl =
  process.env.CONVEX_SITE_URL ??
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL ??
  process.env.NEXT_PUBLIC_CONVEX_URL?.replace(".convex.cloud", ".convex.site");

if (!convexSiteUrl) {
  throw new Error(
    "Missing Convex Site URL. Set CONVEX_SITE_URL or NEXT_PUBLIC_CONVEX_SITE_URL."
  );
}

const { handler } = convexBetterAuthNextJs({
  convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL!,
  convexSiteUrl,
});

export const { GET, POST } = handler;
