import { NextRequest } from "next/server";
import { proxyModalRequest } from "../_lib/modalProxy";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return await proxyModalRequest(request, "/agent/runs");
}
