"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { AgentMessage, AgentApproval, AgentThread, AgentTraceStep } from "./types";
import { MessageBubble } from "./MessageBubble";
import { ApprovalCard } from "./ApprovalCard";
import { AgentInput } from "./AgentInput";
import { TraceRail } from "./TraceRail";
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
  const [traceCollapsed, setTraceCollapsed] = useState(true);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const threadIdRef = useRef<string | null>(null);

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
  const latestRun = runs[0] as { status?: string } | undefined;
  const latestRunStatus = latestRun?.status;

  useEffect(() => {
    if (!isRunning) return;
    if (
      latestRunStatus === "completed" ||
      latestRunStatus === "error" ||
      latestRunStatus === "paused_approval"
    ) {
      setIsRunning(false);
      onArtifactsChange?.(thread?.id);
    }
  }, [latestRunStatus, isRunning, thread?.id, onArtifactsChange]);

  // Keep threadIdRef in sync for scroll behavior.
  useEffect(() => {
    threadIdRef.current = thread?.id ?? null;
  }, [thread]);

  // Auto-scroll when messages change or while streaming.
  const streamingMessage = messages.find((m) => m.isStreaming);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingMessage?.id]);

  async function handleSend(text: string) {
    if (isRunning) return;

    let workingThread = thread;

    setIsRunning(true);
    setTraceCollapsed(true);

    if (!workingThread) {
      setPendingMessage(text);
      try {
        workingThread = await createThread(deriveTitle(text));
        onThreadCreated?.(workingThread);
        threadIdRef.current = workingThread.id;
      } catch {
        setIsRunning(false);
        setPendingMessage(null);
        return;
      }
    }

    try {
      await startRun(workingThread.id, text);
    } catch {
      setIsRunning(false);
    }
    // isRunning is cleared reactively when the Convex run status changes.
  }

  const pendingApprovals = approvals.filter((a) => a.status === "pending");

  // Check if there is a streaming assistant message being patched live.
  const hasStreamingBubble = messages.some((m) => m.isStreaming);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {!thread ? (
          pendingMessage ? (
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
              <div className="flex gap-3">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0A0A0A]">
                  <span className="text-[9px] font-bold text-white">AI</span>
                </div>
                <div className="max-w-[78%]">
                  <div className="rounded-[12px] rounded-tl-[4px] bg-[#F4F4F4] px-3.5 py-2.5 text-[13.5px] leading-[1.55] text-[#111111]">
                    <ThinkingDots />
                  </div>
                </div>
              </div>
              <div ref={bottomRef} />
            </div>
          ) : (
            emptyState ?? (
              <div className="flex h-full items-center justify-center px-8 text-center text-[12.5px] text-[#BBBBBB]">
                Send a message to get started.
              </div>
            )
          )
        ) : !loaded ? (
          <MessageSkeletons />
        ) : messages.length === 0 && !isRunning ? (
          (emptyState ?? <ThreadEmptyState threadTitle={thread.title} />)
        ) : (
          <div className="mx-auto max-w-[700px] space-y-4 px-5 py-5">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {/* Show thinking dots only while running and no streaming bubble yet */}
            {isRunning && !hasStreamingBubble && (
              <div className="flex gap-3">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0A0A0A]">
                  <span className="text-[9px] font-bold text-white">AI</span>
                </div>
                <div className="max-w-[78%]">
                  <div className="rounded-[12px] rounded-tl-[4px] bg-[#F4F4F4] px-3.5 py-2.5 text-[13.5px] leading-[1.55] text-[#111111]">
                    <span className="flex items-center gap-1.5">
                      <ThinkingDots />
                    </span>
                  </div>
                </div>
              </div>
            )}

            {pendingApprovals.map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                onDecision={async () => {
                  onArtifactsChange?.();
                }}
              />
            ))}

            <div ref={bottomRef} />
          </div>
        )}

        {traces.length > 0 && (
          <div className="border-t border-[#F0F0F0] py-3">
            <TraceRail
              traces={traces}
              collapsed={traceCollapsed}
              onToggle={() => setTraceCollapsed((prev) => !prev)}
            />
          </div>
        )}
      </div>

      <AgentInput
        onSubmit={handleSend}
        disabled={isRunning}
        placeholder={isRunning ? "Agent is working..." : "Message the agent..."}
        value={draftValue}
        onValueChange={onDraftChange}
      />
    </div>
  );
}

function ThinkingDots() {
  return (
    <span className="flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-[#BBBBBB]"
          style={{
            animation: "dotPulse 1.2s ease-in-out infinite",
            animationDelay: `${i * 200}ms`,
          }}
        />
      ))}
      <style>{`
        @keyframes dotPulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.85); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </span>
  );
}

function MessageSkeletons() {
  return (
    <div className="mx-auto max-w-[700px] space-y-4 px-5 py-5">
      {[70, 55, 80].map((w, i) => (
        <div
          key={i}
          className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}
        >
          <div
            className="h-9 animate-pulse rounded-[12px] bg-[#F0F0F0]"
            style={{ width: `${w}%` }}
          />
        </div>
      ))}
    </div>
  );
}

function ThreadEmptyState({ threadTitle }: { threadTitle: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <p className="text-[13.5px] font-medium text-[#333333]">{threadTitle}</p>
      <p className="text-[12.5px] text-[#BBBBBB]">
        Send a message to get started.
      </p>
    </div>
  );
}
