"use client";

/**
 * ReviewControls — approve / reject / save-for-later buttons with notes.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ReviewDecision } from "@/lib/speaker-crm/types";

const REASON_CODES = [
  { value: "strong_topic_fit", label: "Strong topic fit" },
  { value: "great_storyteller", label: "Great storyteller" },
  { value: "audience_aligned", label: "Audience aligned" },
  { value: "accessible_budget", label: "Accessible / on budget" },
  { value: "weak_fit", label: "Weak fit for this event" },
  { value: "too_senior", label: "Too senior / hard to book" },
  { value: "wrong_topics", label: "Wrong topics" },
  { value: "duplicate", label: "Duplicate candidate" },
  { value: "revisit_later", label: "Revisit for future event" },
];

interface ReviewControlsProps {
  eventCandidateId: string;
  currentDecision?: ReviewDecision;
  currentNotes?: string;
  onSubmit: (
    eventCandidateId: string,
    decision: ReviewDecision,
    reasonCodes: string[],
    notes: string
  ) => Promise<void>;
  isSubmitting?: boolean;
}

export function ReviewControls({
  eventCandidateId,
  currentDecision,
  currentNotes,
  onSubmit,
  isSubmitting,
}: ReviewControlsProps) {
  const [selected, setSelected] = useState<ReviewDecision | null>(currentDecision ?? null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [notes, setNotes] = useState(currentNotes ?? "");
  const [isSaving, setIsSaving] = useState(false);

  async function handleDecision(decision: ReviewDecision) {
    setSelected(decision);
    setIsSaving(true);
    try {
      await onSubmit(eventCandidateId, decision, reasons, notes);
    } finally {
      setIsSaving(false);
    }
  }

  function toggleReason(code: string) {
    setReasons((prev) =>
      prev.includes(code) ? prev.filter((r) => r !== code) : [...prev, code]
    );
  }

  const loading = isSubmitting || isSaving;

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#6B6B6B]">
          Decision
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={selected === "approved" ? "default" : "outline"}
            disabled={loading}
            onClick={() => handleDecision("approved")}
            className={selected === "approved" ? "border-emerald-600 bg-emerald-600 hover:bg-emerald-700" : ""}
          >
            ✓ Approve
          </Button>
          <Button
            type="button"
            size="sm"
            variant={selected === "saved_later" ? "secondary" : "outline"}
            disabled={loading}
            onClick={() => handleDecision("saved_later")}
          >
            ◷ Save for Later
          </Button>
          <Button
            type="button"
            size="sm"
            variant={selected === "rejected" ? "destructive" : "outline"}
            disabled={loading}
            onClick={() => handleDecision("rejected")}
          >
            ✕ Reject
          </Button>
        </div>

        {selected && (
          <div
            className={`mt-2 rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium ${
              selected === "approved"
                ? "bg-emerald-50 text-emerald-700"
                : selected === "rejected"
                ? "bg-red-50 text-red-600"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {selected === "approved" ? "Approved for outreach" : selected === "rejected" ? "Rejected" : "Saved for later review"}
          </div>
        )}
      </div>

      {/* Reason codes */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#6B6B6B]">
          Reason Codes (optional)
        </p>
        <div className="flex flex-wrap gap-1.5">
          {REASON_CODES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => toggleReason(r.value)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                reasons.includes(r.value)
                  ? "border-[#111111] bg-[#111111] text-white"
                  : "border-[#E0E0E0] text-[#555555] hover:border-[#111111]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#6B6B6B]">
          Reviewer Notes
        </p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any additional context for the team…"
          rows={3}
          className="w-full resize-none rounded-[8px] border border-[#E0E0E0] px-3 py-2 text-[13px] text-[#111111] outline-none transition focus:border-[#111111] focus:ring-2 focus:ring-[#111111]/10"
        />
        {notes && (
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={loading}
            onClick={() => selected && handleDecision(selected)}
            className="mt-1.5"
          >
            Save notes
          </Button>
        )}
      </div>
    </div>
  );
}
