"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { LayoutDashboard } from "lucide-react";
import { ThreadRail } from "@/components/agent/ThreadRail";
import { ConversationTimeline } from "@/components/agent/ConversationTimeline";
import { ArtifactCanvas } from "@/components/agent/ArtifactCanvas";
import { AgentEmptyState } from "@/components/AgentEmptyState";
import type { AgentThread, AgentArtifact } from "@/components/agent/types";
import {
  deleteThread,
  getThreadArtifacts,
  renameThread,
} from "@/components/agent/adapters/runtime";

type ConvexThreadDoc = {
  external_id: string;
  channel: "web" | "discord";
  title?: string | null;
  summary?: string | null;
  last_message_at?: number | null;
  last_run_started_at?: number | null;
  updated_at: number;
};

function mapConvexThread(t: ConvexThreadDoc): AgentThread {
  return {
    id: t.external_id,
    title: t.title ?? "New conversation",
    channel: t.channel,
    lastMessage: t.summary ?? undefined,
    lastActivityAt: t.last_message_at ?? t.last_run_started_at ?? t.updated_at,
  };
}

interface AgentShellProps {
  activeThreadId: string | null;
}

export function AgentShell({ activeThreadId }: AgentShellProps) {
  const router = useRouter();
  const [artifacts, setArtifacts] = useState<AgentArtifact[]>([]);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [draftValue, setDraftValue] = useState("");
  const [trackedThreadId, setTrackedThreadId] = useState<string | null>(activeThreadId);

  // Reset transient view state during render when the active thread changes,
  // following React's "resetting state when a prop changes" guidance.
  if (trackedThreadId !== activeThreadId) {
    setTrackedThreadId(activeThreadId);
    setCanvasOpen(false);
    setDraftValue("");
    setArtifacts([]);
  }

  // Same query ThreadRail uses — Convex deduplicates the subscription.
  const rawThreads = useQuery(api.agentState.listThreads, { limit: 50 });
  const threadList = useMemo(
    () => (rawThreads ? (rawThreads as unknown as ConvexThreadDoc[]) : []),
    [rawThreads],
  );

  const activeThread: AgentThread | null = useMemo(() => {
    if (!activeThreadId) return null;
    const found = threadList.find((t) => t.external_id === activeThreadId);
    // Fall back to a minimal stub while Convex delivers the thread.
    return found
      ? mapConvexThread(found)
      : { id: activeThreadId, title: "Conversation", channel: "web", lastActivityAt: 0 };
  }, [activeThreadId, threadList]);

  // Load artifacts asynchronously when the active thread changes.
  useEffect(() => {
    if (!activeThreadId) return;
    let cancelled = false;
    getThreadArtifacts(activeThreadId).then((arts) => {
      if (!cancelled) setArtifacts(arts);
    });
    return () => { cancelled = true; };
  }, [activeThreadId]);

  const handleArtifactsChange = useCallback(
    async (threadId?: string) => {
      const resolvedId = threadId ?? activeThreadId;
      if (!resolvedId) return;
      const arts = await getThreadArtifacts(resolvedId);
      setArtifacts(arts);
    },
    [activeThreadId],
  );

  return (
    <div
      className="flex h-screen bg-[#FFFFFF] text-[#111111]"
      style={{ fontFamily: "var(--font-geist-sans)" }}
    >
      <ThreadRail
        activeThreadId={activeThreadId}
        activeThread={activeThread}
        onSelectThread={(thread) => router.push(`/agent/${thread.id}`)}
        onStartNewConversation={() => router.push("/agent")}
        onRenameThread={async (threadId, title) => {
          await renameThread(threadId, title);
          // Title updates reactively via the Convex listThreads subscription.
        }}
        onDeleteThread={async (threadId) => {
          await deleteThread(threadId);
          if (activeThreadId === threadId) {
            router.push("/agent");
          }
        }}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-[#EBEBEB] px-5">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {activeThread ? (
              <>
                <h2 className="truncate text-[13.5px] font-semibold text-[#111111]">
                  {activeThread.title}
                </h2>
                {activeThread.contextLinks?.map((link) => (
                  <span
                    key={link.id}
                    className="shrink-0 rounded-full border border-[#E0E0E0] px-2 py-0.5 text-[10.5px] font-medium text-[#555555]"
                  >
                    {link.label}
                  </span>
                ))}
              </>
            ) : (
              <>
                <div className="h-5 w-5 rounded-[6px] bg-[#0A0A0A]" />
                <span className="text-[13px] font-semibold tracking-[-0.01em] text-[#111111]">
                  event.organizer
                </span>
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {artifacts.length > 0 && !canvasOpen && (
              <button
                onClick={() => setCanvasOpen(true)}
                className="rounded-[6px] border border-[#E0E0E0] px-2.5 py-1 text-[12px] font-medium text-[#555555] transition-colors duration-100 hover:bg-[#F4F4F4]"
              >
                Artifacts ({artifacts.length})
              </button>
            )}
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 rounded-[6px] border border-[#E0E0E0] px-2.5 py-1 text-[12px] font-medium text-[#555555] transition-colors duration-100 hover:bg-[#F4F4F4]"
            >
              <LayoutDashboard className="h-3.5 w-3.5" strokeWidth={1.8} />
              Dashboard
            </Link>
          </div>
        </div>

        <ConversationTimeline
          thread={activeThread}
          onArtifactsChange={handleArtifactsChange}
          onThreadCreated={(thread) => {
            router.push(`/agent/${thread.id}`);
          }}
          emptyState={
            <AgentEmptyState
              onPromptSelect={(prompt) => setDraftValue(prompt)}
            />
          }
          draftValue={draftValue}
          onDraftChange={setDraftValue}
        />
      </div>

      {canvasOpen && (
        <div
          className="w-[320px] shrink-0"
          style={{ animation: "canvasSlideIn 180ms cubic-bezier(0.23, 1, 0.32, 1) both" }}
        >
          <ArtifactCanvas
            artifacts={artifacts}
            onClose={() => setCanvasOpen(false)}
          />
        </div>
      )}

      <style>{`
        @keyframes canvasSlideIn {
          from { opacity: 0; transform: translateX(12px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
