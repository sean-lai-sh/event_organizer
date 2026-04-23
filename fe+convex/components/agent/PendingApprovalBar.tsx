"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { AgentApproval, RiskLevel } from "./types";
import { formatPayload } from "./ApprovalCard";
import { submitApproval } from "./adapters/runtime";

interface PendingApprovalBarProps {
  approvals: AgentApproval[];
  onDecision?: (decision: "approved" | "rejected") => void | Promise<void>;
}

const riskConfig: Record<RiskLevel, { label: string; color: string; borderColor: string }> = {
  low:    { label: "Low risk",        color: "text-[#555555]", borderColor: "border-[#E0E0E0]" },
  medium: { label: "Review required", color: "text-[#555555]", borderColor: "border-[#CFCFCF]" },
  high:   { label: "High risk",       color: "text-[#0A0A0A]", borderColor: "border-[#0A0A0A]" },
};

export function PendingApprovalBar({ approvals, onDecision }: PendingApprovalBarProps) {
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  // Clamp index whenever the approvals list shrinks.
  useEffect(() => {
    setIndex((prev) => Math.min(prev, Math.max(0, approvals.length - 1)));
  }, [approvals.length]);

  if (approvals.length === 0) return null;

  const approval = approvals[index];
  const risk = riskConfig[approval.riskLevel];
  const hasMultiple = approvals.length > 1;
  const prettyPayload = formatPayload(approval.proposedPayload);
  const hasPayload = Object.keys(prettyPayload).length > 0;

  async function decide(decision: "approved" | "rejected") {
    if (loading) return;
    setLoading(true);
    try {
      await submitApproval(approval.id, decision);
      await onDecision?.(decision);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={`shrink-0 border-t bg-[#FFFFFF] ${risk.borderColor}`}
      style={{ animation: "approvalBarIn 180ms cubic-bezier(0.23, 1, 0.32, 1) both" }}
    >
      {/* Navigation strip — only shown when multiple pending approvals */}
      {hasMultiple && (
        <div className="flex items-center justify-between border-b border-[#EBEBEB] px-4 py-1.5">
          <button
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            className="flex h-6 w-6 items-center justify-center rounded-[4px] text-[#555555] transition-colors hover:bg-[#F4F4F4] disabled:opacity-30"
            aria-label="Previous approval"
          >
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
          <span className="text-[11px] font-medium text-[#555555]">
            Pending approval · {index + 1} of {approvals.length}
          </span>
          <button
            onClick={() => setIndex((i) => Math.min(approvals.length - 1, i + 1))}
            disabled={index === approvals.length - 1}
            className="flex h-6 w-6 items-center justify-center rounded-[4px] text-[#555555] transition-colors hover:bg-[#F4F4F4] disabled:opacity-30"
            aria-label="Next approval"
          >
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-3 px-4 pt-3 pb-2">
        <AlertTriangle
          className={`mt-0.5 h-4 w-4 shrink-0 ${risk.color}`}
          strokeWidth={1.8}
        />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold leading-snug text-[#0A0A0A]">
            {approval.requestedAction}
          </p>
          <p className={`text-[11.5px] ${risk.color}`}>{risk.label}</p>
        </div>
      </div>

      {/* Payload */}
      {hasPayload && (
        <div className="mx-4 mb-2 rounded-[6px] border border-[#EBEBEB] bg-[#FAFAFA] px-3 py-2">
          <div className="space-y-0.5">
            {Object.entries(prettyPayload).map(([label, value]) => (
              <div key={label} className="flex gap-2 text-[11.5px] leading-snug">
                <span className="shrink-0 font-medium text-[#555555] w-[110px]">{label}</span>
                <span className="text-[#111111] break-all">
                  {typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 px-4 pb-3">
        <button
          onClick={() => decide("rejected")}
          disabled={loading}
          className="flex h-8 items-center gap-1.5 rounded-[6px] border border-[#E0E0E0] px-3 text-[12.5px] font-medium text-[#555555] transition-colors duration-100 hover:border-[#CFCFCF] hover:bg-[#F4F4F4] active:scale-[0.97] disabled:opacity-40"
          style={{ transition: "transform 120ms ease-out, background-color 100ms ease-out" }}
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
          Reject
        </button>
        <button
          onClick={() => decide("approved")}
          disabled={loading}
          className="flex h-8 items-center gap-1.5 rounded-[6px] bg-[#0A0A0A] px-3 text-[12.5px] font-medium text-white transition-colors duration-100 hover:bg-[#222222] active:scale-[0.97] disabled:opacity-40"
          style={{ transition: "transform 120ms ease-out, background-color 100ms ease-out" }}
        >
          <Check className="h-3.5 w-3.5" strokeWidth={2.2} />
          Approve
        </button>
      </div>

      <style>{`
        @keyframes approvalBarIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
