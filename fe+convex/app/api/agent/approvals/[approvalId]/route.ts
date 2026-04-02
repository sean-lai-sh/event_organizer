import { NextRequest } from "next/server";
import { proxyModalRequest } from "../../_lib/modalProxy";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ approvalId: string }> }
) {
  const { approvalId } = await params;
  return await proxyModalRequest(
    request,
    `/agent/approvals/${encodeURIComponent(approvalId)}`
  );
}
