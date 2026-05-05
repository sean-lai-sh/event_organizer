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
import { EmailDraftCanvas } from "./EmailDraftCanvas";

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
  console.log("[ApprovalPrompt] actionType =", approval.actionType, "| requestedAction =", approval.requestedAction);
  const lowerAction = (approval.actionType ?? "").toLowerCase();
  const lowerTitle = (approval.requestedAction ?? "").toLowerCase();
  const isEmailApproval =
    lowerAction.includes("email") ||
    lowerAction.includes("mail") ||
    lowerTitle.includes("email") ||
    lowerTitle.includes("send email") ||
    lowerTitle.includes("draft email");
  if (isEmailApproval) {
    return (
      <EmailDraftCanvas
        approval={approval}
        pendingCount={pendingCount}
        onResolved={onResolved}
        onRejectedWithMessage={onRejectedWithMessage}
      />
    );
  }

  return (
    <GenericApprovalPrompt
      approval={approval}
      pendingCount={pendingCount}
      onResolved={onResolved}
      onRejectedWithMessage={onRejectedWithMessage}
    />
  );
}

function GenericApprovalPrompt({
  approval,
  pendingCount,
  onResolved,
  onRejectedWithMessage,
}: ComposerApprovalPromptProps) {
  const [loading, setLoading] = useState(false);
  const [inputMode, setInputMode] = useState(false);
  const [inputText, setInputText] = useState("");
  const lockRef = useRef(false);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);

  const summary = summarizeApproval(approval);
  const fields = extractApprovalFields(approval.proposedPayload);
  const olderPending = Math.max(0, pendingCount - 1);

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
          <div className="mt-1 flex flex-col gap-1.5 rounded-[6px] border border-[#EBEBEB] bg-[#FAFAFA] px-3 py-2">
            {fields.map((f) => (
              <div key={f.key} className="flex flex-col gap-0.5">
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[#AAAAAA]">
                  {f.label}
                </span>
                <span className="whitespace-pre-wrap break-words text-[12.5px] leading-snug text-[#111111]">
                  {f.displayValue}
                </span>
              </div>
            ))}
          </div>
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
