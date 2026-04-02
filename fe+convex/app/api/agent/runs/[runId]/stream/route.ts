import { NextRequest } from "next/server";
import { proxyModalRequest } from "../../../_lib/modalProxy";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  return await proxyModalRequest(
    request,
    `/agent/runs/${encodeURIComponent(runId)}/stream`
  );
}
