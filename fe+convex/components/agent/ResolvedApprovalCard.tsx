"use client";

import { Check, X } from "lucide-react";
import type { AgentApproval } from "./types";

interface ResolvedApprovalCardProps {
  approval: AgentApproval;
}

export function ResolvedApprovalCard({ approval }: ResolvedApprovalCardProps) {
  const isApproved = approval.status === "approved";
  const statusLabel = isApproved ? "Approved" : "Rejected";
  const StatusIcon = isApproved ? Check : X;
  const statusTone = isApproved ? "text-[#0A0A0A]" : "text-[#999999]";
  const actionLabel = approval.requestedAction.trim() || "Approval required";

  return (
    <div className="mx-auto flex max-w-[520px] items-center gap-2 rounded-[8px] border border-[#E0E0E0] bg-[#FFFFFF] px-3 py-1.5">
      <StatusIcon
        className={`h-3.5 w-3.5 shrink-0 ${statusTone}`}
        strokeWidth={2.2}
      />
      <span className={`text-[12px] font-semibold ${statusTone}`}>
        {statusLabel}
      </span>
      <span className="text-[11.5px] text-[#999999]">·</span>
      <p className="truncate text-[12.5px] text-[#111111]">
        {actionLabel}
      </p>
    </div>
  );
}
