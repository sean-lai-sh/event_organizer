import { NextRequest } from "next/server";
import { proxyModalRequest } from "../../_lib/modalProxy";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  return await proxyModalRequest(
    request,
    `/agent/threads/${encodeURIComponent(threadId)}`
  );
}
