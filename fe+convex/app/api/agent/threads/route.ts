import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { proxyModalRequest } from "../_lib/modalProxy";

function convex() {
  return new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
}

export const dynamic = "force-dynamic";

export async function GET() {
  const threads = await convex().query(api.agentState.listThreads, { limit: 50 });
  return NextResponse.json(threads ?? []);
}

export async function POST(request: NextRequest) {
  return await proxyModalRequest(request, "/agent/threads");
}
