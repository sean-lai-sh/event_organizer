"use client";

import { useRef, useState } from "react";
import type { AgentApproval } from "./types";
import { extractApprovalFields } from "./approvalPayload";
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
  onRejectedWithMessage?: (message: string) => void | Promise<void>;
}

export function ComposerApprovalPrompt({
  approval,
  pendingCount,
  onResolved,
  onRejectedWithMessage,
}: ComposerApprovalPromptProps) {
  const [loading, setLoading] = useState(false);
  const [longExpanded, setLongExpanded] = useState<Record<string, boolean>>({});
  const [inputMode, setInputMode] = useState(false);
  const [inputText, setInputText] = useState("");
  // Ref-based lock so two clicks dispatched in the same React tick — before
  // `disabled={loading}` propagates — still cannot double-submit.
  const lockRef = useRef(false);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const summary = summarizeApproval(approval);
  const fields = extractApprovalFields(approval.proposedPayload);
  const olderPending = Math.max(0, pendingCount - 1);

  function toggleLong(key: string) {
    setLongExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleCta(cta: ComposerCta) {
    if (cta === "tell_me_something_else") {
      setInputMode(true);
      setTimeout(() => messageInputRef.current?.focus(), 0);
      return;
    }
    const decision = decisionForCta(cta);
    await runDecision({
      approvalId: approval.id,
      decision,
      submit: submitApproval,
      lock: lockRef,
      setLoading,
      onResolved,
    });
  }

  async function handleMessageSubmit() {
    const text = inputText.trim();
    if (!text || loading) return;
    const result = await runDecision({
      approvalId: approval.id,
      decision: "rejected",
      submit: submitApproval,
      lock: lockRef,
      setLoading,
      onResolved,
    });
    if (result.status === "submitted") {
      onRejectedWithMessage?.(text);
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

        {fields.length > 0 && (
          <dl className="mt-1 divide-y divide-[#F1F1F1] rounded-[6px] border border-[#EBEBEB] bg-[#FAFAFA] px-3 py-1">
            {fields.map((f) => {
              const expanded = longExpanded[f.key] === true;
              const clamped = f.isLong && f.displayValue.length > 200;
              const shown =
                clamped && !expanded
                  ? f.displayValue.slice(0, 200).trimEnd() + "…"
                  : f.displayValue;
              return (
                <div key={f.key} className="flex gap-3 py-1.5">
                  <dt className="w-[110px] shrink-0 text-[11px] font-medium uppercase tracking-wide text-[#999999]">
                    {f.label}
                  </dt>
                  <dd className="flex-1 text-[12px] leading-snug text-[#111111]">
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

        {inputMode ? (
          <div className="flex flex-col gap-2">
            <textarea
              ref={messageInputRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleMessageSubmit();
                }
                if (e.key === "Escape") {
                  setInputMode(false);
                  setInputText("");
                }
              }}
              placeholder="What should be different?"
              rows={2}
              disabled={loading}
              className="w-full resize-none rounded-[6px] border border-[#E0E0E0] bg-[#FAFAFA] px-3 py-2 text-[12.5px] text-[#111111] placeholder-[#BBBBBB] outline-none focus:border-[#CFCFCF] disabled:opacity-40"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleMessageSubmit}
                disabled={loading || !inputText.trim()}
                className="flex h-7 items-center rounded-[6px] bg-[#0A0A0A] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[#222222] active:scale-[0.97] disabled:opacity-40"
                style={{ transition: "transform 120ms ease-out, background-color 100ms ease-out" }}
              >
                Send
              </button>
              <button
                type="button"
                onClick={() => { setInputMode(false); setInputText(""); }}
                disabled={loading}
                className="text-[11.5px] text-[#999999] transition-colors hover:text-[#555555] disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
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
