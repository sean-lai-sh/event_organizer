"use client";

import { useState } from "react";
import type { AgentApproval } from "./types";
import { extractInnerPayload } from "./approvalPayload";
import { submitApproval } from "./adapters/runtime";
import {
  decisionForCta,
  runDecision,
  summarizeApproval,
  type ComposerCta,
} from "./composerApproval";

interface ComposerApprovalPromptProps {
  approval: AgentApproval;
  pendingCount: number;
  onResolved?: (decision: "approved" | "rejected") => void | Promise<void>;
  onTellMeSomethingElse?: () => void;
}

/**
 * Compact approval strip anchored above the composer.
 *
 * Replaces the prior large inline approval card. Visually monochrome and
 * intentionally low-key so the surface reads as part of the composer rather
 * than a second chat bubble. Raw payload JSON is hidden behind a Details
 * disclosure that is closed by default.
 */
export function ComposerApprovalPrompt({
  approval,
  pendingCount,
  onResolved,
  onTellMeSomethingElse,
}: ComposerApprovalPromptProps) {
  const [loading, setLoading] = useState(false);
  const summary = summarizeApproval(approval);
  const inner = extractInnerPayload(approval.proposedPayload);
  const olderPending = Math.max(0, pendingCount - 1);

  async function handleCta(cta: ComposerCta) {
    await runDecision({
      approvalId: approval.id,
      decision: decisionForCta(cta),
      submit: submitApproval,
      isLoading: loading,
      setLoading,
      onResolved,
    });
    if (cta === "tell_me_something_else") {
      onTellMeSomethingElse?.();
    }
  }

  return (
    <div
      className="shrink-0 border-t border-[#EBEBEB] bg-[#FFFFFF]"
      style={{ animation: "approvalPromptIn 160ms cubic-bezier(0.23, 1, 0.32, 1) both" }}
      role="region"
      aria-label="Pending approval"
    >
      <div className="flex flex-col gap-2 px-4 pt-3 pb-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-[12.5px] font-medium text-[#111111]">
            {summary.title}
          </p>
          {olderPending > 0 && (
            <span className="shrink-0 text-[11px] text-[#999999]">
              +{olderPending} more pending
            </span>
          )}
        </div>
        {summary.detail && (
          <p className="truncate text-[11.5px] text-[#777777]">{summary.detail}</p>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleCta("yes")}
            disabled={loading}
            className="flex h-7 items-center rounded-[6px] bg-[#0A0A0A] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[#222222] active:scale-[0.97] disabled:opacity-40"
            style={{ transition: "transform 120ms ease-out, background-color 100ms ease-out" }}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => handleCta("no")}
            disabled={loading}
            className="flex h-7 items-center rounded-[6px] border border-[#E0E0E0] px-3 text-[12px] font-medium text-[#333333] transition-colors hover:border-[#CFCFCF] hover:bg-[#F4F4F4] active:scale-[0.97] disabled:opacity-40"
            style={{ transition: "transform 120ms ease-out, background-color 100ms ease-out" }}
          >
            No
          </button>
          <button
            type="button"
            onClick={() => handleCta("tell_me_something_else")}
            disabled={loading}
            className="flex h-7 items-center rounded-[6px] border border-transparent px-2 text-[12px] font-medium text-[#555555] transition-colors hover:border-[#E0E0E0] hover:bg-[#F4F4F4] active:scale-[0.97] disabled:opacity-40"
            style={{ transition: "transform 120ms ease-out, background-color 100ms ease-out" }}
          >
            Tell me something else
          </button>
        </div>

        {Object.keys(inner).length > 0 && (
          <details className="group mt-0.5">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] font-medium text-[#999999] outline-none transition-colors hover:text-[#555555]">
              <span className="inline-block transition-transform group-open:rotate-90">›</span>
              Details
            </summary>
            <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-[6px] border border-[#EBEBEB] bg-[#FAFAFA] px-2.5 py-1.5 font-mono text-[10.5px] text-[#555555]">
              {JSON.stringify(inner, null, 2)}
            </pre>
          </details>
        )}
      </div>

      <style>{`
        @keyframes approvalPromptIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
