"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { Mail, Send, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { AgentEmailDraft, EmailDraftStatus } from "./types";

interface EmailDraftCardProps {
  draft: AgentEmailDraft;
}

interface SendResponse {
  status: "sent" | "failed";
  message_id?: string;
  error?: string;
}

const STATUS_LABEL: Record<EmailDraftStatus, string> = {
  draft: "PENDING_ACTION: SEND_EMAIL",
  sending: "SENDING…",
  sent: "SENT",
  failed: "SEND FAILED",
  discarded: "DISCARDED",
};

function shortId(id: string): string {
  // "draft_8f4fa178…1224b" → "8F4F-1224B" style label.
  const stem = id.replace(/^draft_/, "");
  if (stem.length <= 9) return stem.toUpperCase();
  return `${stem.slice(0, 4).toUpperCase()}-${stem.slice(-5).toUpperCase()}`;
}

export function EmailDraftCard({ draft }: EmailDraftCardProps) {
  const updateDraftFields = useMutation(api.emailDrafts.updateDraftFields);
  const markDiscarded = useMutation(api.emailDrafts.markDiscarded);

  const editable = draft.status === "draft";

  const [toName, setToName] = useState(draft.toName);
  const [toEmail, setToEmail] = useState(draft.toEmail);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Re-sync local state when the upstream draft changes (Convex live query).
  useEffect(() => {
    setToName(draft.toName);
    setToEmail(draft.toEmail);
    setSubject(draft.subject);
    setBody(draft.body);
  }, [draft.toName, draft.toEmail, draft.subject, draft.body]);

  async function persistField(
    field: "to_name" | "to_email" | "subject" | "body",
    value: string
  ) {
    if (!editable) return;
    try {
      await updateDraftFields({
        external_id: draft.id,
        [field]: value,
      } as never);
    } catch (err) {
      // Silent retry on next blur; surface in console for diagnostics.
      console.warn("Failed to persist draft edit", err);
    }
  }

  async function handleSend() {
    if (!editable || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Flush local edits before kicking off the send so we don't race the
      // unawaited blur-time mutation against `markSending`. The send route
      // also persists these fields server-side as a second line of defense,
      // but doing it here keeps the Convex live query consistent for any
      // other tabs viewing this thread.
      try {
        await updateDraftFields({
          external_id: draft.id,
          to_name: toName,
          to_email: toEmail,
          subject,
          body,
        });
      } catch {
        /* ignore — server route will re-persist before locking */
      }

      const res = await fetch("/api/agent/email/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          draft_id: draft.id,
          to_name: toName,
          to_email: toEmail,
          subject,
          body,
          from_name: draft.fromName,
          from_email: draft.fromEmail,
          signature: draft.signature,
        }),
      });
      const json = (await res.json()) as SendResponse;
      if (!res.ok || json.status !== "sent") {
        setSubmitError(json.error || "Send failed");
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDiscard() {
    if (!editable || submitting) return;
    if (!window.confirm("Discard this draft? It will not be sent.")) return;
    try {
      await markDiscarded({ external_id: draft.id });
    } catch (err) {
      console.warn("Failed to discard draft", err);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[640px] overflow-hidden rounded-[12px] border border-[#E0E0E0] bg-white shadow-sm">
      <div
        className={`flex items-center justify-between px-4 py-2.5 ${
          draft.status === "sent"
            ? "bg-[#0F7A3D]"
            : draft.status === "discarded"
              ? "bg-[#A8002C]"
              : "bg-[#0A0A0A]"
        }`}
      >
        <div className="flex items-center gap-2">
          <Mail className="h-3.5 w-3.5 text-white" strokeWidth={2.2} />
          <span className="font-mono text-[11.5px] font-semibold tracking-wider text-white">
            {STATUS_LABEL[draft.status]}
          </span>
        </div>
        <span
          className={`font-mono text-[11px] ${
            draft.status === "sent" || draft.status === "discarded"
              ? "text-white/70"
              : "text-[#9A9A9A]"
          }`}
        >
          ID: {shortId(draft.id)}
        </span>
      </div>

      <div className="space-y-3 px-4 py-4">
        <FieldRow label="TO">
          <div className="flex flex-1 items-center gap-2">
            <input
              type="text"
              value={toName}
              onChange={(e) => setToName(e.target.value)}
              onBlur={() => persistField("to_name", toName)}
              disabled={!editable}
              placeholder="Recipient name"
              className="w-32 bg-transparent text-[13px] text-[#111111] placeholder:text-[#BBBBBB] focus:outline-none disabled:opacity-60"
            />
            <span className="text-[12px] text-[#999999]">·</span>
            <input
              type="email"
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              onBlur={() => persistField("to_email", toEmail)}
              disabled={!editable}
              placeholder="email@example.com"
              className="flex-1 bg-transparent text-[13px] text-[#111111] placeholder:text-[#BBBBBB] focus:outline-none disabled:opacity-60"
            />
          </div>
        </FieldRow>

        <FieldRow label="SUBJ">
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            onBlur={() => persistField("subject", subject)}
            disabled={!editable}
            placeholder="Subject line"
            className="w-full bg-transparent text-[13px] font-medium text-[#111111] placeholder:text-[#BBBBBB] focus:outline-none disabled:opacity-60"
          />
        </FieldRow>

        <div className="rounded-[8px] border border-[#E8E8E8] bg-[#FAFAFA] px-3 py-2.5 transition-colors focus-within:border-[#CFCFCF] focus-within:bg-white">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onBlur={() => persistField("body", body)}
            disabled={!editable}
            rows={6}
            placeholder="Email body…"
            className="w-full resize-y bg-transparent text-[13px] leading-[1.55] text-[#111111] placeholder:text-[#BBBBBB] focus:outline-none disabled:opacity-60"
            style={{ fontFamily: "var(--font-app-sans)" }}
          />
        </div>

        {draft.status === "failed" && draft.errorMessage && (
          <p className="rounded-[6px] bg-[#FFF3F3] px-3 py-2 text-[12px] text-[#A8002C]">
            {draft.errorMessage}
          </p>
        )}
        {submitError && draft.status === "draft" && (
          <p className="rounded-[6px] bg-[#FFF3F3] px-3 py-2 text-[12px] text-[#A8002C]">
            {submitError}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-[#EFEFEF] bg-[#FAFAFA] px-4 py-2.5">
        <button
          type="button"
          onClick={handleDiscard}
          disabled={!editable || submitting}
          className="flex items-center gap-1.5 text-[12px] font-medium text-[#777777] transition-colors hover:text-[#A8002C] disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} />
          Discard
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={!editable || submitting || !toEmail || !subject}
          className="flex items-center gap-1.5 rounded-[6px] bg-[#0A0A0A] px-3 py-1.5 text-[12px] font-semibold text-white transition-all hover:bg-[#222222] active:scale-[0.97] disabled:bg-[#E0E0E0] disabled:text-[#BBBBBB]"
        >
          <Send className="h-3.5 w-3.5" strokeWidth={2.2} />
          {submitting ? "Sending…" : draft.status === "sent" ? "Sent" : "Send"}
        </button>
      </div>
    </div>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-12 shrink-0 font-mono text-[10.5px] font-semibold tracking-wider text-[#999999]">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
