"use client";

/**
 * CandidateListItem — one row in the candidate list panel.
 */

import { scoreTierLabel, scoreTierColor, confidenceTierLabel } from "@/lib/speaker-crm/scoring";
import type { EventCandidateStatus } from "@/lib/speaker-crm/types";

interface CandidateListItemProps {
  candidateId: string;
  fullName: string;
  currentTitle?: string;
  companyName?: string;
  overallScore?: number;
  confidence?: number;
  status: EventCandidateStatus;
  isSelected: boolean;
  onClick: () => void;
}

const STATUS_BADGE: Record<EventCandidateStatus, { label: string; cls: string }> = {
  sourced: { label: "Sourced", cls: "bg-[#F0F0F0] text-[#6B6B6B]" },
  enriched: { label: "Enriched", cls: "bg-blue-50 text-blue-600" },
  scored: { label: "Scored", cls: "bg-amber-50 text-amber-700" },
  approved: { label: "Approved", cls: "bg-emerald-50 text-emerald-700" },
  rejected: { label: "Rejected", cls: "bg-red-50 text-red-600" },
  saved_later: { label: "Saved", cls: "bg-purple-50 text-purple-700" },
};

export function CandidateListItem({
  fullName,
  currentTitle,
  companyName,
  overallScore,
  confidence,
  status,
  isSelected,
  onClick,
}: CandidateListItemProps) {
  const badge = STATUS_BADGE[status];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-[8px] border p-3 text-left transition ${
        isSelected
          ? "border-[#111111] bg-[#F8F8F8]"
          : "border-transparent hover:border-[#E0E0E0] hover:bg-[#FAFAFA]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-[#111111]">{fullName}</p>
          {(currentTitle || companyName) && (
            <p className="truncate text-[11px] text-[#6B6B6B]">
              {currentTitle}
              {currentTitle && companyName ? " · " : ""}
              {companyName}
            </p>
          )}
        </div>

        {overallScore !== undefined && (
          <div className="shrink-0 text-right">
            <span
              className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[11px] font-bold ${scoreTierColor(overallScore)}`}
            >
              {overallScore.toFixed(1)}
            </span>
            {confidence !== undefined && (
              <p className="mt-0.5 text-[10px] text-[#AAAAAA]">
                {confidenceTierLabel(confidence)} conf.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.cls}`}>
          {badge.label}
        </span>
        {overallScore !== undefined && (
          <span className="text-[10px] text-[#AAAAAA]">{scoreTierLabel(overallScore)}</span>
        )}
      </div>
    </button>
  );
}
