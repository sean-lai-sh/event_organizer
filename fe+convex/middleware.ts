import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

function getSafeRedirectPath(redirect: string | null): string | null {
  if (!redirect) return null;
  if (!redirect.startsWith("/") || redirect.startsWith("//")) return null;
  return redirect;
}

export async function middleware(request: NextRequest) {
  const session = getSessionCookie(request);
  const { pathname, search } = request.nextUrl;
  const isDashboardRoute = pathname.startsWith("/dashboard");
  const isAgentRoute = pathname === "/agent" || pathname.startsWith("/agent/");
  const isAuthRoute = pathname === "/login" || pathname === "/signup";

  if (!session && (isDashboardRoute || isAgentRoute)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (session && isAuthRoute) {
    const safeRedirect =
      getSafeRedirectPath(request.nextUrl.searchParams.get("redirect")) ?? "/agent";
    return NextResponse.redirect(new URL(safeRedirect, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/agent", "/agent/:path*", "/login", "/signup"],
};
