"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import type { FunctionReference } from "convex/server";
import { useMutation } from "convex/react";
import { ThreadRail } from "@/components/agent/ThreadRail";
import { ConversationTimeline } from "@/components/agent/ConversationTimeline";
import { ArtifactCanvas } from "@/components/agent/ArtifactCanvas";
import { AgentEmptyState } from "@/components/AgentEmptyState";
import type { AgentThread, AgentArtifact } from "@/components/agent/types";
import { getThreadArtifacts } from "@/components/agent/adapters/mock";

export default function AgentPage() {
  const agentApi = (
    api as unknown as {
      agent: {
        renameThread: FunctionReference<"mutation", "public">;
        deleteThread: FunctionReference<"mutation", "public">;
      };
    }
  ).agent;
  const renameThreadMutation = useMutation(agentApi.renameThread);
  const deleteThreadMutation = useMutation(agentApi.deleteThread);
  const [activeThread, setActiveThread] = useState<AgentThread | null>(null);
  const [artifacts, setArtifacts] = useState<AgentArtifact[]>([]);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [draftValue, setDraftValue] = useState("");

  async function loadThread(thread: AgentThread) {
    setActiveThread(thread);
    setDraftValue("");
    const arts = await getThreadArtifacts(thread.id);
    setArtifacts(arts);
    setCanvasOpen(arts.length > 0);
  }

  const handleArtifactsChange = useCallback(
    async (threadId?: string) => {
      const resolvedThreadId = threadId ?? activeThread?.id;
      if (!resolvedThreadId) return;
      const arts = await getThreadArtifacts(resolvedThreadId);
      setArtifacts(arts);
      if (arts.length > 0) setCanvasOpen(true);
    },
    [activeThread],
  );

  return (
    <div
      className="flex h-screen bg-[#FFFFFF] text-[#111111]"
      style={{ fontFamily: "var(--font-geist-sans)" }}
    >
      <ThreadRail
        activeThreadId={activeThread?.id ?? null}
        activeThread={activeThread}
        onSelectThread={loadThread}
        onStartNewConversation={() => {
          setActiveThread(null);
          setArtifacts([]);
          setCanvasOpen(false);
          setDraftValue("");
        }}
        onRenameThread={async (threadId, title) => {
          await renameThread(threadId, title);
          await renameThreadMutation({ external_id: threadId, title }).catch(
            () => undefined,
          );
          setActiveThread((prev) =>
            prev && prev.id === threadId ? { ...prev, title } : prev,
          );
        }}
        onDeleteThread={async (threadId) => {
          await deleteThread(threadId);
          await deleteThreadMutation({ external_id: threadId }).catch(
            () => undefined,
          );
          if (activeThread?.id === threadId) {
            setActiveThread(null);
            setArtifacts([]);
            setCanvasOpen(false);
            setDraftValue("");
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
            setActiveThread(thread);
            setArtifacts([]);
            setCanvasOpen(false);
          }}
          emptyState={
            <AgentEmptyState
              onPromptSelect={(prompt) => {
                setDraftValue(prompt);
              }}
            />
          }
          draftValue={draftValue}
          onDraftChange={setDraftValue}
        />
      </div>

      {canvasOpen && (
        <div
          className="w-[320px] shrink-0"
          style={{
            animation:
              "canvasSlideIn 180ms cubic-bezier(0.23, 1, 0.32, 1) both",
          }}
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
