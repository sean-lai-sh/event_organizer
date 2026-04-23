"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { AgentMessage, AgentApproval, AgentThread, AgentTraceStep } from "./types";
import { MessageBubble } from "./MessageBubble";
import { ApprovalCard } from "./ApprovalCard";
import { PendingApprovalBar } from "./PendingApprovalBar";
import { AgentInput } from "./AgentInput";
import {
  createThread,
  startRun,
} from "./adapters/runtime";

interface ConversationTimelineProps {
  thread: AgentThread | null;
  onArtifactsChange?: (threadId?: string) => void | Promise<void>;
  onThreadCreated?: (thread: AgentThread) => void;
  emptyState?: ReactNode;
  draftValue?: string;
  onDraftChange?: (value: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Map Convex document shapes into the frontend AgentMessage /        */
/*  AgentApproval / AgentTraceStep types so existing rendering         */
/*  components stay stable.                                            */
/* ------------------------------------------------------------------ */

type ConvexMessage = {
  external_id: string;
  thread_id: string;
  role: string;
  status?: string;
  plain_text?: string | null;
  content_blocks: Array<{
    kind: string;
    label?: string | null;
    text?: string | null;
    mime_type?: string | null;
    data_json?: string | null;
    url?: string | null;
  }>;
  created_at: number;
};

type ConvexApproval = {
  external_id: string;
  thread_id: string;
  run_id: string;
  title: string;
  payload_json?: string | null;
  status: string;
  risk_level: string;
  requested_at: number;
};

type ConvexTrace = {
  external_id: string;
  run_id: string;
  kind: string;
  sequence_number: number;
  summary: string;
  detail_json?: string | null;
  status: string;
  created_at: number;
};

function mapConvexMessage(msg: ConvexMessage): AgentMessage {
  const content = msg.content_blocks.map((block) => {
    if (block.kind === "text" || block.kind === "markdown") {
      return {
        type: "text" as const,
        text: block.text ?? "",
        format: block.kind === "markdown" ? ("markdown" as const) : ("plain" as const),
      };
    }
    if (block.kind === "tool_use") {
      let input: Record<string, unknown> | undefined;
      if (block.data_json) {
        try { input = JSON.parse(block.data_json); } catch { /* ignore */ }
      }
      return { type: "tool_use" as const, name: block.label ?? "tool", input };
    }
    return { type: "tool_result" as const, content: block.text ?? block.label ?? block.kind };
  });

  return {
    id: msg.external_id,
    threadId: msg.thread_id as string,
    role: msg.role === "tool" ? "tool" : msg.role === "user" ? "user" : "assistant",
    content: content.length > 0 ? content : [{ type: "text", text: msg.plain_text ?? "" }],
    createdAt: msg.created_at,
    isStreaming: msg.status === "streaming",
  };
}

function mapConvexApproval(a: ConvexApproval): AgentApproval {
  let proposedPayload: Record<string, unknown> = {};
  if (a.payload_json) {
    try { proposedPayload = JSON.parse(a.payload_json); } catch { /* ignore */ }
  }
  return {
    id: a.external_id,
    threadId: a.thread_id as string,
    runId: a.run_id as string,
    requestedAction: a.title,
    riskLevel: a.risk_level as AgentApproval["riskLevel"],
    proposedPayload,
    status: a.status as AgentApproval["status"],
    createdAt: a.requested_at,
  };
}

function mapConvexTrace(t: ConvexTrace): AgentTraceStep {
  return {
    id: t.external_id,
    runId: t.run_id as string,
    kind: t.kind as AgentTraceStep["kind"],
    sequenceNumber: t.sequence_number,
    summary: t.summary,
    detailJson: t.detail_json,
    status: t.status,
    createdAt: t.created_at,
  };
}

function deriveTitle(text: string): string {
  const MAX = 60;
  const trimmed = text.trim();
  if (trimmed.length <= MAX) return trimmed;
  const cut = trimmed.slice(0, MAX);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut) + "…";
}

export function ConversationTimeline({
  thread,
  onArtifactsChange,
  onThreadCreated,
  emptyState,
  draftValue,
  onDraftChange,
}: ConversationTimelineProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [tracesVisible, setTracesVisible] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const threadIdRef = useRef<string | null>(null);
  const messagesAtSend = useRef<number>(0);
  const traceHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks which thread the active run belongs to so the thread-change effect
  // doesn't clear tracesVisible when onThreadCreated fires for a first message.
  const runThreadIdRef = useRef<string | null>(null);
  // Captures the latestRunInternalId at send time so old-run traces aren't
  // shown during the gap between send and Convex delivering the new run.
  const lastRunIdBeforeSend = useRef<string | null>(null);
  // Prevents the run-in-progress initializer from firing more than once per mount.
  const runInitialized = useRef(false);

  // Reactive Convex query: automatically updates when the backend patches
  // messages, approvals, traces, or run status via append_message / upsert_*.
  const threadState = useQuery(
    api.agentState.getThreadState,
    thread?.id ? { external_id: thread.id } : "skip",
  );

  // Derive messages, approvals, and traces from the reactive query result.
  const messages: AgentMessage[] = threadState
    ? (threadState.messages as unknown as ConvexMessage[]).map(mapConvexMessage)
    : [];

  const approvals: AgentApproval[] = threadState
    ? (threadState.approvals as unknown as ConvexApproval[]).map(mapConvexApproval)
    : [];

  const traces: AgentTraceStep[] = threadState
    ? ((threadState.traces as unknown as ConvexTrace[]) ?? []).map(mapConvexTrace)
    : [];

  const loaded = thread ? threadState !== undefined : true;

  // Detect run completion to clear the running flag and refresh artifacts.
  const runs = threadState?.runs ?? [];
  // Cast to include _id — Convex serialises it as a string, and trace.run_id
  // references this internal _id, NOT the human-readable external_id.
  const latestRun = runs[0] as { status?: string; _id?: string } | undefined;
  const latestRunStatus = latestRun?.status;
  const latestRunInternalId = latestRun?._id ?? null;

  useEffect(() => {
    if (!isRunning) return;
    if (
      latestRunStatus === "completed" ||
      latestRunStatus === "error" ||
      latestRunStatus === "paused_approval"
    ) {
      setIsRunning(false);
      onArtifactsChange?.(thread?.id);
      // Fade traces out 30s after run completes.
      if (traceHideTimer.current) clearTimeout(traceHideTimer.current);
      traceHideTimer.current = setTimeout(() => setTracesVisible(false), 30_000);
    }
  }, [latestRunStatus, isRunning, thread?.id, onArtifactsChange]);

  // Keep threadIdRef in sync for scroll behavior.
  useEffect(() => {
    threadIdRef.current = thread?.id ?? null;
  }, [thread]);

  // Clear the trace-hide timer on unmount to prevent setState on an
  // unmounted component if the user navigates away before it fires.
  useEffect(() => {
    return () => {
      if (traceHideTimer.current) clearTimeout(traceHideTimer.current);
    };
  }, []);

  // When navigating directly to /agent/<id> while a run is in progress,
  // bootstrap isRunning and tracesVisible from the Convex run status so the
  // thinking state shows without the user having called handleSend.
  // runInitialized is reset on thread change so this fires once per thread.
  useEffect(() => {
    if (runInitialized.current || latestRunStatus === undefined) return;
    runInitialized.current = true;
    if (latestRunStatus === "running") {
      setIsRunning(true);
      setTracesVisible(true);
    }
  }, [latestRunStatus]);

  // Clear traces/running state when switching threads, but not when the thread
  // changes because onThreadCreated just fired for the current run
  // (runThreadIdRef guards that case).
  useEffect(() => {
    if (thread?.id !== runThreadIdRef.current) {
      if (traceHideTimer.current) clearTimeout(traceHideTimer.current);
      setTracesVisible(false);
      // Clear isRunning so AgentInput isn't stuck disabled on the new thread.
      setIsRunning(false);
      runThreadIdRef.current = null;
      // Allow the bootstrap effect to re-run for the incoming thread.
      runInitialized.current = false;
    }
    if (!thread) setPendingMessage(null);
  }, [thread]);

  // Once Convex delivers messages beyond what we had at send time, retire the optimistic bubble.
  useEffect(() => {
    if (pendingMessage !== null && messages.length > messagesAtSend.current) {
      setPendingMessage(null);
    }
  }, [messages.length, pendingMessage]);

  // Auto-scroll when messages change, optimistic bubble appears, or while streaming.
  const streamingMessage = messages.find((m) => m.isStreaming);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingMessage?.id, pendingMessage]);

  async function handleSend(text: string) {
    if (isRunning) return;
    // Don't allow sends before threadState has loaded — latestRunInternalId
    // would be null, causing old-run traces to appear once state arrives.
    if (!loaded) return;

    let workingThread = thread;

    messagesAtSend.current = messages.length;
    lastRunIdBeforeSend.current = latestRunInternalId;
    setIsRunning(true);
    setTracesVisible(true);
    if (traceHideTimer.current) clearTimeout(traceHideTimer.current);
    setPendingMessage(text);

    if (!workingThread) {
      try {
        workingThread = await createThread(deriveTitle(text));
        // Set before onThreadCreated so the thread-change effect sees the match
        // and doesn't clear tracesVisible for this in-flight run.
        runThreadIdRef.current = workingThread.id;
        threadIdRef.current = workingThread.id;
        onThreadCreated?.(workingThread);
      } catch {
        setIsRunning(false);
        setPendingMessage(null);
        return;
      }
    } else {
      runThreadIdRef.current = workingThread.id;
    }

    try {
      await startRun(workingThread.id, text);
    } catch {
      // If the run failed to start, clear all optimistic state so the UI
      // doesn't get stuck in a pending/thinking state with no response.
      setIsRunning(false);
      setPendingMessage(null);
      setTracesVisible(false);
      runThreadIdRef.current = null;
    }
    // isRunning is cleared reactively when the Convex run status changes.
  }

  const pendingApprovals = approvals.filter((a) => a.status === "pending");
  const resolvedApprovals = approvals.filter((a) => a.status !== "pending");

  // Only suppress ThinkingBubble once a streaming message has actual text to show.
  const hasStreamingBubble = messages.some(
    (m) => m.isStreaming && m.content.some((b) => b.type === "text" && b.text.length > 0),
  );

  // Show traces only for the current run, and only once Convex has delivered a
  // NEW run (latestRunInternalId changed from what it was at send time).
  // This prevents old-run traces from flashing during the transition.
  const displayTraces =
    tracesVisible &&
    latestRunInternalId &&
    latestRunInternalId !== lastRunIdBeforeSend.current
      ? traces.filter((t) => t.runId === latestRunInternalId)
      : [];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {!thread ? (
          pendingMessage ? (
            <PendingConversationView
              pendingMessage={pendingMessage}
              bottomRef={bottomRef}
            />
          ) : (
            emptyState ?? (
              <div className="flex h-full items-center justify-center px-8 text-center text-[12.5px] text-[#BBBBBB]">
                Send a message to get started.
              </div>
            )
          )
        ) : !loaded ? (
          pendingMessage ? (
            <PendingConversationView
              pendingMessage={pendingMessage}
              bottomRef={bottomRef}
            />
          ) : (
            <MessageSkeletons />
          )
        ) : messages.length === 0 && !isRunning ? (
          (emptyState ?? (
            <div className="flex h-full items-center justify-center px-8 text-center text-[12.5px] text-[#BBBBBB]">
              Send a message to get started.
            </div>
          ))
        ) : (
          <div className="mx-auto max-w-[700px] space-y-4 px-5 py-5">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {pendingMessage && (
              <div className="flex justify-end gap-3">
                <div className="max-w-[78%]">
                  <div className="rounded-[12px] rounded-br-[4px] bg-[#0A0A0A] px-3.5 py-2.5 text-[13.5px] leading-[1.55] text-white">
                    {pendingMessage}
                  </div>
                </div>
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#E0E0E0] bg-[#FFFFFF]">
                  <span className="text-[10px] font-semibold text-[#555555]">U</span>
                </div>
              </div>
            )}

            {isRunning && !hasStreamingBubble && displayTraces.length === 0 && (
              <ThinkingBubble />
            )}

            <div ref={bottomRef} />

            {displayTraces.length > 0 && (
              <InlineTraceList traces={displayTraces} isRunning={isRunning} />
            )}

            {resolvedApprovals.map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
              />
            ))}
          </div>
        )}
      </div>

      {pendingApprovals.length > 0 && (
        <PendingApprovalBar
          approvals={pendingApprovals}
          onDecision={async (decision) => {
            if (decision === "approved") {
              // Re-arm isRunning so the run-completion effect fires when the
              // resumed run finishes and resets the trace-hide timer.
              setIsRunning(true);
            }
            onArtifactsChange?.();
          }}
        />
      )}

      <AgentInput
        onSubmit={handleSend}
        disabled={isRunning || pendingApprovals.length > 0}
        placeholder={
          pendingApprovals.length > 0
            ? "Approve or reject the action above to continue..."
            : isRunning
            ? "Agent is working..."
            : "Message the agent..."
        }
        value={draftValue}
        onValueChange={onDraftChange}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared optimistic view shown before Convex delivers real messages  */
/* ------------------------------------------------------------------ */

function PendingConversationView({
  pendingMessage,
  bottomRef,
}: {
  pendingMessage: string;
  bottomRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="mx-auto max-w-[700px] space-y-4 px-5 py-5">
      <div className="flex justify-end gap-3">
        <div className="max-w-[78%]">
          <div className="rounded-[12px] rounded-br-[4px] bg-[#0A0A0A] px-3.5 py-2.5 text-[13.5px] leading-[1.55] text-white">
            {pendingMessage}
          </div>
        </div>
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#E0E0E0] bg-[#FFFFFF]">
          <span className="text-[10px] font-semibold text-[#555555]">U</span>
        </div>
      </div>
      <ThinkingBubble />
      <div ref={bottomRef} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Thinking bubble: live trace summary → rotating preset fallback     */
/* ------------------------------------------------------------------ */

const THINKING_PHRASES = [
  "Thinking", "Analyzing", "Searching", "Processing", "Reasoning",
  "Looking into this", "Exploring", "Connecting the dots",
  "Gathering context", "Reviewing", "Evaluating", "Synthesizing",
  "Investigating", "Working on it", "Fetching data", "Querying",
  "Formulating a response", "Preparing", "Consulting records", "Considering",
];

function ThinkingBubble() {
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setPhraseIndex((i) => (i + 1) % THINKING_PHRASES.length);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-2 text-[13.5px] text-[#AAAAAA]">
      <span>{THINKING_PHRASES[phraseIndex]}</span>
      <span
        className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#CCCCCC]"
        style={{ animation: "thinkPulse 1.2s ease-in-out infinite" }}
      />
      <style>{`
        @keyframes thinkPulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.85); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

function formatTraceKind(kind: string): string {
  return kind
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function InlineTraceList({
  traces,
  isRunning,
}: {
  traces: AgentTraceStep[];
  isRunning: boolean;
}) {
  return (
    <div className="space-y-1">
      {traces.map((step, i) => {
        const isLatest = i === traces.length - 1;
        const label = step.summary || formatTraceKind(step.kind);
        return (
          <div key={step.id} className="flex items-center gap-2 text-[11.5px] text-[#BBBBBB]">
            <div className="h-1 w-1 shrink-0 rounded-full bg-[#DDDDDD]" />
            <span>{label}</span>
            {isLatest && isRunning && (
              <span
                className="inline-block h-1 w-1 shrink-0 rounded-full bg-[#CCCCCC]"
                style={{ animation: "thinkPulse 1.2s ease-in-out infinite" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function MessageSkeletons() {
  return (
    <div className="mx-auto max-w-[700px] space-y-5 px-5 py-5">
      {/* User bubble */}
      <div className="flex justify-end gap-3">
        <div className="h-9 w-[52%] animate-pulse rounded-[12px] rounded-br-[4px] bg-[#EBEBEB]" />
        <div className="mt-0.5 h-6 w-6 shrink-0 animate-pulse rounded-full bg-[#E8E8E8]" />
      </div>
      {/* Assistant response — multi-line block */}
      <div className="flex justify-start gap-3">
        <div className="mt-0.5 h-6 w-6 shrink-0 animate-pulse rounded-full bg-[#E8E8E8]" />
        <div className="flex flex-1 flex-col gap-2">
          <div className="h-3.5 w-[88%] animate-pulse rounded-full bg-[#F0F0F0]" />
          <div className="h-3.5 w-[72%] animate-pulse rounded-full bg-[#F0F0F0]" />
          <div className="h-3.5 w-[80%] animate-pulse rounded-full bg-[#F0F0F0]" />
          <div className="h-3.5 w-[55%] animate-pulse rounded-full bg-[#F0F0F0]" />
        </div>
      </div>
      {/* Second user bubble */}
      <div className="flex justify-end gap-3">
        <div className="h-9 w-[38%] animate-pulse rounded-[12px] rounded-br-[4px] bg-[#EBEBEB]" />
        <div className="mt-0.5 h-6 w-6 shrink-0 animate-pulse rounded-full bg-[#E8E8E8]" />
      </div>
      {/* Second assistant response */}
      <div className="flex justify-start gap-3">
        <div className="mt-0.5 h-6 w-6 shrink-0 animate-pulse rounded-full bg-[#E8E8E8]" />
        <div className="flex flex-1 flex-col gap-2">
          <div className="h-3.5 w-[76%] animate-pulse rounded-full bg-[#F0F0F0]" />
          <div className="h-3.5 w-[62%] animate-pulse rounded-full bg-[#F0F0F0]" />
        </div>
      </div>
    </div>
  );
}

