"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import type { AgentApproval } from "./types";
import { extractApprovalFields, extractInnerPayload } from "./approvalPayload";

interface ResolvedApprovalCardProps {
  approval: AgentApproval;
}

const DESCRIPTION_CLAMP_CHARS = 220;

export function ResolvedApprovalCard({ approval }: ResolvedApprovalCardProps) {
  const [longExpanded, setLongExpanded] = useState<Record<string, boolean>>({});
  const fields = extractApprovalFields(approval.proposedPayload);
  const inner = extractInnerPayload(approval.proposedPayload);
  const isApproved = approval.status === "approved";

  const statusLabel = isApproved ? "Approved" : "Rejected";
  const StatusIcon = isApproved ? Check : X;
  const statusTone = isApproved
    ? { text: "text-[#0A0A0A]", border: "border-[#E0E0E0]" }
    : { text: "text-[#999999]", border: "border-[#E0E0E0]" };

  function toggleLong(key: string) {
    setLongExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div
      className={`mx-auto max-w-[520px] rounded-[10px] border bg-[#FFFFFF] ${statusTone.border}`}
    >
      {/* Status header */}
      <div className="flex items-center gap-2 border-b border-[#EBEBEB] px-4 py-2.5">
        <StatusIcon
          className={`h-3.5 w-3.5 shrink-0 ${statusTone.text}`}
          strokeWidth={2.2}
        />
        <span className={`text-[12px] font-semibold ${statusTone.text}`}>
          {statusLabel}
        </span>
        <span className="text-[11.5px] text-[#999999]">·</span>
        <p className="truncate text-[12.5px] text-[#111111]">
          {approval.requestedAction}
        </p>
      </div>

      {/* Field list */}
      {fields.length > 0 && (
        <dl className="divide-y divide-[#F1F1F1] px-4 py-2">
          {fields.map((f) => {
            const expanded = longExpanded[f.key] === true;
            const clamped =
              f.isLong && f.displayValue.length > DESCRIPTION_CLAMP_CHARS;
            const shown =
              clamped && !expanded
                ? f.displayValue.slice(0, DESCRIPTION_CLAMP_CHARS).trimEnd() + "…"
                : f.displayValue;
            return (
              <div
                key={f.key}
                className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:gap-3"
              >
                <dt className="w-[120px] shrink-0 text-[11.5px] font-medium uppercase tracking-wide text-[#999999]">
                  {f.label}
                </dt>
                <dd className="flex-1 text-[12.5px] leading-snug text-[#111111]">
                  <span className={f.isLong ? "whitespace-pre-wrap break-words" : "break-words"}>
                    {shown}
                  </span>
                  {clamped && (
                    <button
                      type="button"
                      onClick={() => toggleLong(f.key)}
                      className="ml-2 text-[11px] font-medium text-[#555555] underline-offset-2 hover:underline"
                    >
                      {expanded ? "Show less" : "Show more"}
                    </button>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}

      {/* Raw JSON disclosure — collapsed by default. */}
      {Object.keys(inner).length > 0 && (
        <details className="group border-t border-[#EBEBEB] px-4 py-2">
          <summary
            className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-medium text-[#999999] outline-none transition-colors hover:text-[#555555]"
          >
            <span className="inline-block transition-transform group-open:rotate-90">
              ›
            </span>
            Raw payload
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-[6px] border border-[#EBEBEB] bg-[#FAFAFA] px-3 py-2 font-mono text-[10.5px] text-[#555555]">
            {JSON.stringify(inner, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
