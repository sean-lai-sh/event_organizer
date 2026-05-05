"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentApproval } from "./types";
import { extractInnerPayload } from "./approvalPayload";
import { submitApproval } from "./adapters/runtime";
import { runDecision } from "./composerApproval";

interface EmailDraftCanvasProps {
  approval: AgentApproval;
  pendingCount: number;
  onResolved?: (decision: "approved" | "rejected") => void | Promise<void>;
  onRejectedWithMessage?: (message: string) => void | Promise<void>;
}

interface EmailFields {
  recipient_name: string;
  recipient_email: string;
  subject: string;
  message_body: string;
  sender_name: string;
  sender_email: string;
  signature: string;
}

function readEmailFields(approval: AgentApproval): EmailFields {
  const inner = extractInnerPayload(approval.proposedPayload);
  const get = (k: keyof EmailFields) => {
    const v = inner[k];
    return v !== null && v !== undefined ? String(v) : "";
  };
  return {
    recipient_name: get("recipient_name"),
    recipient_email: get("recipient_email"),
    subject: get("subject"),
    message_body: get("message_body"),
    sender_name: get("sender_name"),
    sender_email: get("sender_email"),
    signature: get("signature"),
  };
}

export function EmailDraftCanvas({
  approval,
  pendingCount,
  onResolved,
  onRejectedWithMessage,
}: EmailDraftCanvasProps) {
  const [fields, setFields] = useState<EmailFields>(() => readEmailFields(approval));
  const [selectionText, setSelectionText] = useState<string | null>(null);
  const [askInput, setAskInput] = useState("");
  const [loading, setLoading] = useState(false);

  const lockRef = useRef(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const askInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFields(readEmailFields(approval));
    setSelectionText(null);
    setAskInput("");
  }, [approval.id, approval.proposedPayload]);

  useEffect(() => {
    if (selectionText) askInputRef.current?.focus();
  }, [selectionText]);

  const olderPending = Math.max(0, pendingCount - 1);

  function captureSelection() {
    const ta = bodyRef.current;
    if (!ta) return;
    const selected = ta.value.slice(ta.selectionStart, ta.selectionEnd).trim();
    setSelectionText(selected || null);
  }

  function updateField<K extends keyof EmailFields>(key: K, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleConfirm() {
    if (loading) return;
    await runDecision({
      approvalId: approval.id,
      decision: "approved",
      submit: submitApproval,
      lock: lockRef,
      setLoading,
      onResolved,
      overrideArgs: fields as unknown as Record<string, unknown>,
    });
  }

  async function handleDiscard() {
    if (loading) return;
    await runDecision({
      approvalId: approval.id,
      decision: "rejected",
      submit: submitApproval,
      lock: lockRef,
      setLoading,
      onResolved,
    });
  }

  async function handleAskForChanges() {
    const passage = (selectionText ?? "").trim();
    const instruction = askInput.trim();
    if (!passage || !instruction || loading) return;

    const message = [
      "Please revise the highlighted passage in the email body and re-issue the send_outreach_email approval.",
      `Highlighted passage: """${passage}"""`,
      `Change requested: ${instruction}`,
      "Keep the rest of the email body unchanged. Preserve the existing recipient, sender, and subject unless the change instruction implies otherwise.",
    ].join("\n");

    const result = await runDecision({
      approvalId: approval.id,
      decision: "rejected",
      submit: submitApproval,
      lock: lockRef,
      setLoading,
      onResolved,
    });
    if (result.status === "submitted") {
      setSelectionText(null);
      setAskInput("");
      onRejectedWithMessage?.(message);
    }
  }

  const recipientLabel = fields.recipient_name
    ? `${fields.recipient_name} <${fields.recipient_email}>`
    : fields.recipient_email || "—";

  const bodyRows = Math.min(18, Math.max(6, fields.message_body.split("\n").length + 1));

  return (
    <div
      className="shrink-0 border-t border-[#EBEBEB] bg-[#FFFFFF]"
      style={{ animation: "emailCanvasIn 160ms cubic-bezier(0.23, 1, 0.32, 1) both" }}
      role="region"
      aria-label="Email draft"
    >
      <div className="flex flex-col gap-2 px-4 pt-3 pb-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold text-[#111111]">
            Draft Email
            {olderPending > 0 && (
              <span className="ml-2 font-normal text-[#999999]">+{olderPending} more pending</span>
            )}
          </span>
          <button
            type="button"
            onClick={handleDiscard}
            disabled={loading}
            aria-label="Discard draft"
            title="Discard"
            className="flex h-6 w-6 items-center justify-center rounded-[5px] text-[#AAAAAA] transition-colors hover:bg-[#F4F4F4] hover:text-[#111111] disabled:opacity-40"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Email card */}
        <div className="flex flex-col overflow-hidden rounded-[8px] border border-[#EBEBEB] bg-[#FAFAFA]">
          {/* To — read-only display */}
          <div className="flex items-center gap-2 border-b border-[#F1F1F1] px-3 py-1.5">
            <span className="w-[46px] shrink-0 text-[10.5px] font-semibold uppercase tracking-wide text-[#AAAAAA]">To</span>
            <span className="truncate text-[12px] text-[#444444]">{recipientLabel}</span>
          </div>

          {/* Subject — editable input */}
          <div className="flex items-center gap-2 border-b border-[#F1F1F1] px-3 py-1.5">
            <span className="w-[46px] shrink-0 text-[10.5px] font-semibold uppercase tracking-wide text-[#AAAAAA]">Subj</span>
            <input
              type="text"
              value={fields.subject}
              onChange={(e) => updateField("subject", e.target.value)}
              disabled={loading}
              placeholder="Subject"
              className="flex-1 bg-transparent text-[12.5px] font-medium text-[#111111] outline-none placeholder-[#CCCCCC] disabled:opacity-50"
            />
          </div>

          {/* Body — always-editable textarea with selection capture */}
          <textarea
            ref={bodyRef}
            value={fields.message_body}
            onChange={(e) => updateField("message_body", e.target.value)}
            onMouseUp={captureSelection}
            onKeyUp={captureSelection}
            rows={bodyRows}
            disabled={loading}
            placeholder="Message body…"
            className="w-full resize-y bg-transparent px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-[#111111] outline-none placeholder-[#CCCCCC] disabled:opacity-50"
          />

          {/* Signature */}
          {fields.signature && (
            <>
              <div className="h-px bg-[#F1F1F1]" />
              <textarea
                value={fields.signature}
                onChange={(e) => updateField("signature", e.target.value)}
                rows={2}
                disabled={loading}
                className="w-full resize-none bg-transparent px-3 py-2 text-[12px] leading-snug text-[#888888] outline-none disabled:opacity-50"
              />
            </>
          )}
        </div>

        {/* Action bar */}
        {selectionText ? (
          <div className="flex items-center gap-1.5 rounded-[8px] border border-[#E0E0E0] bg-[#FFFFFF] px-2.5 py-1.5">
            <PencilIcon className="h-3 w-3 shrink-0 text-[#777777]" />
            <input
              ref={askInputRef}
              type="text"
              value={askInput}
              onChange={(e) => setAskInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && askInput.trim()) {
                  e.preventDefault();
                  handleAskForChanges();
                }
                if (e.key === "Escape") {
                  setSelectionText(null);
                  setAskInput("");
                }
              }}
              placeholder="Ask for changes to selection…"
              disabled={loading}
              className="flex-1 bg-transparent text-[12px] text-[#111111] placeholder-[#BBBBBB] outline-none disabled:opacity-40"
            />
            <button
              type="button"
              onClick={handleAskForChanges}
              disabled={loading || !askInput.trim()}
              aria-label="Request changes"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0A0A0A] text-white transition-opacity hover:opacity-90 disabled:opacity-30"
            >
              <ArrowUpIcon className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className="flex h-7 items-center rounded-[6px] bg-[#0A0A0A] px-4 text-[12px] font-medium text-white transition-colors hover:bg-[#222222] active:scale-[0.97] disabled:opacity-40"
              style={{ transition: "transform 120ms ease-out, background-color 100ms ease-out" }}
            >
              {loading ? "Sending…" : "Confirm"}
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes emailCanvasIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function ArrowUpIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}
