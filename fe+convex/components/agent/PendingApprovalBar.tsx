"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Pencil, X } from "lucide-react";
import type { AgentApproval, RiskLevel } from "./types";
import { FIELD_LABELS } from "./ApprovalCard";
import { submitApproval } from "./adapters/runtime";

type FieldEntry = { key: string; label: string; rawValue: string };

function getRawFields(payload: Record<string, unknown>): FieldEntry[] {
  const payloadInner = (payload?.payload as Record<string, unknown> | undefined)?.tool_input;
  const inner =
    payloadInner && typeof payloadInner === "object"
      ? (payloadInner as Record<string, unknown>)
      : payload;
  return Object.entries(inner)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => ({
      key: k,
      label: FIELD_LABELS[k] ?? k,
      rawValue: typeof v === "boolean" ? (v ? "Yes" : "No") : String(v),
    }));
}

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
  const [step, setStep] = useState(0);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [loading, setLoading] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Clamp approval index when list shrinks.
  useEffect(() => {
    setIndex((prev) => Math.min(prev, Math.max(0, approvals.length - 1)));
  }, [approvals.length]);

  const approval = approvals[index];

  // Restore persisted draft (step + overrides) when the active approval changes;
  // fall back to defaults if nothing is saved.
  useEffect(() => {
    if (!approval?.id) return;
    try {
      const raw = sessionStorage.getItem(`approval_draft_${approval.id}`);
      if (raw) {
        const { step: s, overrides: o } = JSON.parse(raw) as {
          step: number;
          overrides: Record<string, string>;
        };
        setStep(s ?? 0);
        setOverrides(o ?? {});
      } else {
        setStep(0);
        setOverrides({});
      }
    } catch {
      setStep(0);
      setOverrides({});
    }
    setEditing(false);
    setEditValue("");
  }, [approval?.id]);

  // Persist step + overrides to sessionStorage whenever they change.
  useEffect(() => {
    if (!approval?.id) return;
    sessionStorage.setItem(
      `approval_draft_${approval.id}`,
      JSON.stringify({ step, overrides }),
    );
  }, [approval?.id, step, overrides]);

  useEffect(() => {
    if (editing) editInputRef.current?.focus();
  }, [editing]);

  if (approvals.length === 0 || !approval) return null;

  const fields = getRawFields(approval.proposedPayload);
  const isConfirmStep = step >= fields.length;
  const risk = riskConfig[approval.riskLevel];
  const hasMultiple = approvals.length > 1;
  const currentField = fields[step] as FieldEntry | undefined;

  function startEdit() {
    if (!currentField) return;
    setEditValue(overrides[currentField.key] ?? currentField.rawValue);
    setEditing(true);
  }

  function confirmEdit() {
    if (!currentField) return;
    setOverrides((prev) => ({ ...prev, [currentField.key]: editValue }));
    setEditing(false);
    setEditValue("");
    setStep((s) => s + 1);
  }

  function advanceStep() {
    setEditing(false);
    setEditValue("");
    setStep((s) => s + 1);
  }

  function goBack() {
    setEditing(false);
    setEditValue("");
    setStep((s) => Math.max(0, s - 1));
  }

  async function decide(decision: "approved" | "rejected") {
    if (loading) return;
    setLoading(true);
    try {
      const changedOverrides =
        decision === "approved"
          ? Object.fromEntries(
              Object.entries(overrides).filter(([k, v]) => {
                const original = fields.find((f) => f.key === k)?.rawValue;
                return v !== original;
              }),
            )
          : undefined;
      await submitApproval(
        approval.id,
        decision,
        changedOverrides && Object.keys(changedOverrides).length > 0
          ? changedOverrides
          : undefined,
      );
      sessionStorage.removeItem(`approval_draft_${approval.id}`);
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
      {/* Multi-approval navigation */}
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
          <p className={`text-[11.5px] ${risk.color}`}>
            {isConfirmStep
              ? `${risk.label} · Review all ${fields.length} fields`
              : `${risk.label} · Field ${step + 1} of ${fields.length}`}
          </p>
        </div>
      </div>

      {/* Field step */}
      {!isConfirmStep && currentField && (
        <div className="mx-4 mb-2 rounded-[6px] border border-[#EBEBEB] bg-[#FAFAFA] px-3 py-2.5">
          <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-[#AAAAAA]">
            {currentField.label}
          </p>
          {editing ? (
            <input
              ref={editInputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmEdit();
                if (e.key === "Escape") { setEditing(false); setEditValue(""); }
              }}
              className="w-full rounded-[4px] border border-[#CFCFCF] bg-white px-2 py-1 text-[13px] text-[#111111] outline-none focus:border-[#0A0A0A]"
            />
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span
                className={`text-[13px] leading-snug ${
                  overrides[currentField.key] !== undefined &&
                  overrides[currentField.key] !== currentField.rawValue
                    ? "font-medium text-[#0A0A0A]"
                    : "text-[#333333]"
                }`}
              >
                {overrides[currentField.key] ?? currentField.rawValue}
              </span>
              <button
                onClick={startEdit}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] text-[#BBBBBB] transition-colors hover:bg-[#EBEBEB] hover:text-[#555555]"
                aria-label="Edit value"
              >
                <Pencil className="h-3 w-3" strokeWidth={2} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Confirm step: all fields summary */}
      {isConfirmStep && (
        <div className="mx-4 mb-2 max-h-32 overflow-y-auto rounded-[6px] border border-[#EBEBEB] bg-[#FAFAFA] px-3 py-2">
          <div className="space-y-0.5">
            {fields.map((f) => {
              const displayValue = overrides[f.key] ?? f.rawValue;
              const modified =
                overrides[f.key] !== undefined && overrides[f.key] !== f.rawValue;
              return (
                <div key={f.key} className="flex gap-2 text-[11.5px] leading-snug">
                  <span className="w-[110px] shrink-0 font-medium text-[#555555]">
                    {f.label}
                  </span>
                  <span className={`break-all ${modified ? "font-medium text-[#0A0A0A]" : "text-[#111111]"}`}>
                    {displayValue}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between gap-2 px-4 pb-3">
        {/* Reject always on left */}
        <button
          onClick={() => decide("rejected")}
          disabled={loading}
          className="flex h-8 items-center gap-1.5 rounded-[6px] border border-[#E0E0E0] px-3 text-[12.5px] font-medium text-[#555555] transition-colors hover:border-[#CFCFCF] hover:bg-[#F4F4F4] active:scale-[0.97] disabled:opacity-40"
          style={{ transition: "transform 120ms ease-out, background-color 100ms ease-out" }}
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
          Reject
        </button>

        {/* Navigation on right */}
        <div className="flex items-center gap-2">
          {step > 0 && (
            <button
              onClick={goBack}
              disabled={loading || editing}
              className="flex h-8 items-center gap-0.5 text-[12px] font-medium text-[#999999] transition-colors hover:text-[#555555] disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
              Back
            </button>
          )}

          {isConfirmStep ? (
            <button
              onClick={() => decide("approved")}
              disabled={loading}
              className="flex h-8 items-center gap-1.5 rounded-[6px] bg-[#0A0A0A] px-3 text-[12.5px] font-medium text-white transition-colors hover:bg-[#222222] active:scale-[0.97] disabled:opacity-40"
              style={{ transition: "transform 120ms ease-out, background-color 100ms ease-out" }}
            >
              <Check className="h-3.5 w-3.5" strokeWidth={2.2} />
              Approve
            </button>
          ) : editing ? (
            <button
              onClick={confirmEdit}
              className="flex h-8 items-center gap-1.5 rounded-[6px] bg-[#0A0A0A] px-3 text-[12.5px] font-medium text-white transition-colors hover:bg-[#222222] active:scale-[0.97]"
              style={{ transition: "transform 120ms ease-out, background-color 100ms ease-out" }}
            >
              <Check className="h-3.5 w-3.5" strokeWidth={2.2} />
              Confirm
            </button>
          ) : (
            <button
              onClick={advanceStep}
              disabled={loading}
              className="flex h-8 items-center gap-1 rounded-[6px] bg-[#0A0A0A] px-3 text-[12.5px] font-medium text-white transition-colors hover:bg-[#222222] active:scale-[0.97] disabled:opacity-40"
              style={{ transition: "transform 120ms ease-out, background-color 100ms ease-out" }}
            >
              {step === fields.length - 1 ? "Review" : "Next"}
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          )}
        </div>
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
