import { NextRequest, NextResponse } from "next/server";

function getModalBaseUrl() {
  const value = process.env.NEXT_PUBLIC_MODAL_ENDPOINT?.trim();
  if (!value) {
    throw new Error("NEXT_PUBLIC_MODAL_ENDPOINT is not configured.");
  }
  return value.replace(/\/+$/, "");
}

function buildUpstreamUrl(pathname: string, searchParams?: URLSearchParams) {
  const url = new URL(`${getModalBaseUrl()}${pathname}`);
  if (searchParams) {
    for (const [key, value] of searchParams.entries()) {
      url.searchParams.append(key, value);
    }
  }
  return url;
}

function copyHeaders(source: Headers) {
  const headers = new Headers();
  for (const key of ["content-type", "cache-control"]) {
    const value = source.get(key);
    if (value) {
      headers.set(key, value);
    }
  }
  return headers;
}

export async function proxyModalRequest(request: NextRequest, pathname: string) {
  try {
    const upstreamUrl = buildUpstreamUrl(pathname, request.nextUrl.searchParams);
    const headers = new Headers();
    const accept = request.headers.get("accept");
    const contentType = request.headers.get("content-type");

    if (accept) headers.set("accept", accept);
    if (contentType) headers.set("content-type", contentType);

    const body =
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.text();

    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
    });

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: copyHeaders(upstream.headers),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to reach agent runtime.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
