"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [selectionText, setSelectionText] = useState<string | null>(null);
  const [askInput, setAskInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const lockRef = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const askInputRef = useRef<HTMLInputElement>(null);

  // Re-seed when a new approval lands (e.g. after a partial-revision round-trip).
  useEffect(() => {
    setFields(readEmailFields(approval));
    setMode("view");
    setSelectionText(null);
    setAskInput("");
  }, [approval.id, approval.proposedPayload]);

  useEffect(() => {
    if (selectionText) askInputRef.current?.focus();
  }, [selectionText]);

  const olderPending = Math.max(0, pendingCount - 1);

  function captureSelection() {
    if (mode !== "view") return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !bodyRef.current) {
      setSelectionText(null);
      return;
    }
    const anchor = sel.anchorNode;
    const focus = sel.focusNode;
    const within =
      (anchor && bodyRef.current.contains(anchor)) ||
      (focus && bodyRef.current.contains(focus));
    if (!within) {
      setSelectionText(null);
      return;
    }
    const text = sel.toString().trim();
    if (!text) {
      setSelectionText(null);
      return;
    }
    setSelectionText(text);
  }

  async function handleCancel() {
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

  async function handleSend() {
    if (loading) return;
    await runDecision({
      approvalId: approval.id,
      decision: "approved",
      submit: submitApproval,
      lock: lockRef,
      setLoading,
      onResolved,
      overrideArgs: fields,
    });
  }

  async function handleCopy() {
    const text = `Subject: ${fields.subject}\n\n${fields.message_body}${fields.signature ? `\n\n${fields.signature}` : ""}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // best-effort; ignore
    }
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

  function updateField<K extends keyof EmailFields>(key: K, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div
      className="shrink-0 border-t border-[#EBEBEB] bg-[#FFFFFF]"
      style={{ animation: "emailCanvasIn 160ms cubic-bezier(0.23, 1, 0.32, 1) both" }}
      role="region"
      aria-label="Email draft"
    >
      <div className="flex flex-col gap-2 px-4 pt-3 pb-3">
        {olderPending > 0 && (
          <div className="flex justify-end">
            <span className="text-[11px] text-[#999999]">+{olderPending} more pending</span>
          </div>
        )}

        <div className="rounded-[10px] border border-[#EBEBEB] bg-[#FAFAFA]">
          {/* Top bar */}
          <div className="flex items-center justify-between gap-2 border-b border-[#EBEBEB] px-3 py-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {selectionText && mode === "view" ? (
                <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[999px] border border-[#E0E0E0] bg-[#FFFFFF] px-2.5 py-1">
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
                    placeholder="Ask for changes"
                    disabled={loading}
                    className="w-full bg-transparent text-[12px] text-[#111111] placeholder-[#BBBBBB] outline-none disabled:opacity-40"
                  />
                  <button
                    type="button"
                    onClick={handleAskForChanges}
                    disabled={loading || !askInput.trim()}
                    aria-label="Send changes"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0A0A0A] text-white transition-opacity hover:opacity-90 disabled:opacity-30"
                  >
                    <ArrowUpIcon className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setMode((m) => (m === "edit" ? "view" : "edit"))}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-[999px] border border-[#E0E0E0] bg-[#FFFFFF] px-2.5 py-1 text-[12px] font-medium text-[#333333] transition-colors hover:border-[#CFCFCF] hover:bg-[#F4F4F4] active:scale-[0.97] disabled:opacity-40"
                  style={{ transition: "transform 120ms ease-out, background-color 100ms ease-out, border-color 100ms ease-out" }}
                >
                  <PencilIcon className="h-3 w-3" />
                  {mode === "edit" ? "Done" : "Edit"}
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleCancel}
                disabled={loading}
                aria-label="Cancel email"
                title="Cancel"
                className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#555555] transition-colors hover:bg-[#F1F1F1] hover:text-[#111111] disabled:opacity-40"
              >
                <XIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleCopy}
                aria-label={copied ? "Copied" : "Copy email"}
                title={copied ? "Copied" : "Copy"}
                className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#555555] transition-colors hover:bg-[#F1F1F1] hover:text-[#111111]"
              >
                <CopyIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={loading}
                aria-label="Send email"
                title="Send"
                className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#555555] transition-colors hover:bg-[#F1F1F1] hover:text-[#111111] disabled:opacity-40"
              >
                <SendIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex flex-col gap-3 px-4 py-3">
            {/* Meta — To / From */}
            <div className="flex flex-col gap-1.5">
              <MetaRow
                label="To"
                mode={mode}
                primary={fields.recipient_email}
                secondary={fields.recipient_name}
                onPrimaryChange={(v) => updateField("recipient_email", v)}
                onSecondaryChange={(v) => updateField("recipient_name", v)}
                primaryPlaceholder="recipient@example.com"
                secondaryPlaceholder="Recipient name"
              />
              <MetaRow
                label="From"
                mode={mode}
                primary={fields.sender_email}
                secondary={fields.sender_name}
                onPrimaryChange={(v) => updateField("sender_email", v)}
                onSecondaryChange={(v) => updateField("sender_name", v)}
                primaryPlaceholder="you@example.com"
                secondaryPlaceholder="Your name"
              />
            </div>

            <div className="h-px bg-[#EBEBEB]" />

            {/* Subject */}
            <div className="flex items-baseline gap-3">
              <span className="w-[60px] shrink-0 text-[11px] font-semibold uppercase tracking-wide text-[#999999]">
                Subject
              </span>
              {mode === "edit" ? (
                <input
                  type="text"
                  value={fields.subject}
                  onChange={(e) => updateField("subject", e.target.value)}
                  disabled={loading}
                  className="flex-1 rounded-[4px] border border-[#E0E0E0] bg-[#FFFFFF] px-2 py-1 text-[13px] font-medium text-[#111111] outline-none focus:border-[#CFCFCF] disabled:opacity-40"
                />
              ) : (
                <span className="flex-1 text-[13px] font-semibold text-[#111111]">
                  {fields.subject || <em className="text-[#999999]">No subject</em>}
                </span>
              )}
            </div>

            <div className="h-px bg-[#EBEBEB]" />

            {/* Body region */}
            {mode === "edit" ? (
              <textarea
                value={fields.message_body}
                onChange={(e) => updateField("message_body", e.target.value)}
                rows={Math.min(20, Math.max(8, fields.message_body.split("\n").length + 2))}
                disabled={loading}
                className="w-full resize-y rounded-[4px] border border-[#E0E0E0] bg-[#FFFFFF] px-2 py-1.5 text-[13px] leading-relaxed text-[#111111] outline-none focus:border-[#CFCFCF] disabled:opacity-40"
              />
            ) : (
              <div
                ref={bodyRef}
                onMouseUp={captureSelection}
                onKeyUp={captureSelection}
                className="select-text text-[13px] leading-relaxed text-[#111111] [&_strong]:font-semibold [&_em]:italic [&_u]:underline [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:mb-0.5"
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {fields.message_body || "_(empty body)_"}
                </ReactMarkdown>
              </div>
            )}

            {fields.signature && (
              <>
                <div className="h-px bg-[#EBEBEB]" />
                {mode === "edit" ? (
                  <textarea
                    value={fields.signature}
                    onChange={(e) => updateField("signature", e.target.value)}
                    rows={2}
                    disabled={loading}
                    className="w-full resize-none rounded-[4px] border border-[#E0E0E0] bg-[#FFFFFF] px-2 py-1.5 text-[12px] leading-snug text-[#555555] outline-none focus:border-[#CFCFCF] disabled:opacity-40"
                  />
                ) : (
                  <div className="whitespace-pre-wrap text-[12px] leading-snug text-[#555555]">
                    {fields.signature}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
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

function MetaRow({
  label,
  mode,
  primary,
  secondary,
  onPrimaryChange,
  onSecondaryChange,
  primaryPlaceholder,
  secondaryPlaceholder,
}: {
  label: string;
  mode: "view" | "edit";
  primary: string;
  secondary: string;
  onPrimaryChange: (v: string) => void;
  onSecondaryChange: (v: string) => void;
  primaryPlaceholder: string;
  secondaryPlaceholder: string;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-[60px] shrink-0 text-[11px] font-semibold uppercase tracking-wide text-[#999999]">
        {label}
      </span>
      {mode === "edit" ? (
        <div className="flex flex-1 items-center gap-1.5">
          <input
            type="text"
            value={secondary}
            onChange={(e) => onSecondaryChange(e.target.value)}
            placeholder={secondaryPlaceholder}
            className="w-[160px] rounded-[4px] border border-[#E0E0E0] bg-[#FFFFFF] px-2 py-1 text-[12px] text-[#111111] outline-none focus:border-[#CFCFCF]"
          />
          <input
            type="text"
            value={primary}
            onChange={(e) => onPrimaryChange(e.target.value)}
            placeholder={primaryPlaceholder}
            className="flex-1 rounded-[4px] border border-[#E0E0E0] bg-[#FFFFFF] px-2 py-1 text-[12px] text-[#111111] outline-none focus:border-[#CFCFCF]"
          />
        </div>
      ) : (
        <span className="flex-1 text-[12px] text-[#333333]">
          {secondary ? (
            <>
              <span className="font-medium text-[#111111]">{secondary}</span>
              {primary && <span className="text-[#999999]"> &lt;{primary}&gt;</span>}
            </>
          ) : (
            <span className="text-[#777777]">{primary || "—"}</span>
          )}
        </span>
      )}
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

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m22 2-7 20-4-9-9-4 20-7Z" />
      <path d="M22 2 11 13" />
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
