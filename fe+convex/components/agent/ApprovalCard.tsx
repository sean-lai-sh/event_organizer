"use client";

import { useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import type { AgentApproval, RiskLevel } from "./types";
import { submitApproval } from "./adapters/runtime";

export const FIELD_LABELS: Record<string, string> = {
  title: "Event Name",
  event_date: "Date",
  event_time: "Start Time",
  event_end_time: "End Time",
  location: "Location",
  event_type: "Event Type",
  description: "Description",
  status: "Status",
  needs_outreach: "Needs Outreach",
  target_profile: "Target Audience",
  speaker_confirmed: "Speaker Confirmed",
  room_confirmed: "Room Confirmed",
  event_id: "Event ID",
  firstname: "First Name",
  lastname: "Last Name",
  email: "Email",
  record_id: "Record ID",
  contact_source: "Contact Source",
  contact_type: "Contact Type",
};

export function formatPayload(raw: Record<string, unknown>): Record<string, unknown> {
  const payloadInner = (raw?.payload as Record<string, unknown> | undefined)?.tool_input;
  const inner = (payloadInner && typeof payloadInner === "object")
    ? (payloadInner as Record<string, unknown>)
    : raw;
  return Object.fromEntries(
    Object.entries(inner)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => [FIELD_LABELS[k] ?? k, v])
  );
}

interface ApprovalCardProps {
  approval: AgentApproval;
  onDecision?: (decision: "approved" | "rejected") => void | Promise<void>;
}

const riskConfig: Record<RiskLevel, { label: string; color: string; border: string }> = {
  low: {
    label: "Low risk",
    color: "text-[#555555]",
    border: "border-[#E0E0E0]",
  },
  medium: {
    label: "Review required",
    color: "text-[#555555]",
    border: "border-[#CFCFCF]",
  },
  high: {
    label: "High risk",
    color: "text-[#0A0A0A]",
    border: "border-[#0A0A0A]",
  },
};

export function ApprovalCard({ approval, onDecision }: ApprovalCardProps) {
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">(approval.status);
  const [loading, setLoading] = useState(false);

  const risk = riskConfig[approval.riskLevel];

  async function decide(decision: "approved" | "rejected") {
    if (loading || status !== "pending") return;
    setLoading(true);
    try {
      await submitApproval(approval.id, decision);
      setStatus(decision);
      await onDecision?.(decision);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={`mx-auto max-w-[520px] rounded-[10px] border bg-[#FFFFFF] ${risk.border}`}
      style={{
        animation: "approvalIn 200ms cubic-bezier(0.23, 1, 0.32, 1) both",
      }}
    >
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-[#EBEBEB] px-4 py-3">
        <AlertTriangle
          className={`mt-0.5 h-4 w-4 shrink-0 ${risk.color}`}
          strokeWidth={1.8}
        />
        <div>
          <p className="text-[12.5px] font-semibold text-[#0A0A0A]">Approval required</p>
          <p className={`text-[11.5px] ${risk.color}`}>{risk.label}</p>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        <p className="text-[13px] font-medium leading-snug text-[#111111]">
          {approval.requestedAction}
        </p>

        {Object.keys(approval.proposedPayload).length > 0 && (
          <div className="mt-2 rounded-[6px] border border-[#EBEBEB] bg-[#FAFAFA] px-3 py-2">
            <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-[#555555]">
              {JSON.stringify(formatPayload(approval.proposedPayload), null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 border-t border-[#EBEBEB] px-4 py-2.5">
        {status === "pending" ? (
          <>
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
          </>
        ) : (
          <span
            className={`text-[12px] font-medium ${
              status === "approved" ? "text-[#555555]" : "text-[#999999]"
            }`}
          >
            {status === "approved" ? "Approved" : "Rejected"}
          </span>
        )}
      </div>

      <style>{`
        @keyframes approvalIn {
          from { opacity: 0; transform: translateY(6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
