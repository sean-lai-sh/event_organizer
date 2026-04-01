"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { ThreadRail } from "@/components/agent/ThreadRail";
import { ConversationTimeline } from "@/components/agent/ConversationTimeline";
import { ArtifactCanvas } from "@/components/agent/ArtifactCanvas";
import type { AgentThread, AgentArtifact } from "@/components/agent/types";
import { getThreadArtifacts } from "@/components/agent/adapters/mock";

export default function AgentPage() {
  const [activeThread, setActiveThread] = useState<AgentThread | null>(null);
  const [artifacts, setArtifacts] = useState<AgentArtifact[]>([]);
  const [canvasOpen, setCanvasOpen] = useState(false);

  async function loadThread(thread: AgentThread) {
    setActiveThread(thread);
    const arts = await getThreadArtifacts(thread.id);
    setArtifacts(arts);
    setCanvasOpen(arts.length > 0);
  }

  const handleArtifactsChange = useCallback(async () => {
    if (!activeThread) return;
    const arts = await getThreadArtifacts(activeThread.id);
    setArtifacts(arts);
    if (arts.length > 0) setCanvasOpen(true);
  }, [activeThread]);

  return (
    <div
      className="flex h-screen bg-[#FFFFFF] text-[#111111]"
      style={{ fontFamily: "var(--font-geist-sans)" }}
    >
      {/* Left rail */}
      <ThreadRail
        activeThreadId={activeThread?.id ?? null}
        onSelectThread={loadThread}
        onNewThread={(thread) => {
          setActiveThread(thread);
          setArtifacts([]);
          setCanvasOpen(false);
        }}
      />

      {/* Center — conversation */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-[#EBEBEB] px-5">
          {/* Thread title (or logo when no thread selected) */}
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

        {/* Timeline */}
        <ConversationTimeline
          thread={activeThread}
          onArtifactsChange={handleArtifactsChange}
        />
      </div>

      {/* Right — artifact canvas */}
      {canvasOpen && (
        <div
          className="w-[320px] shrink-0"
          style={{
            animation: "canvasSlideIn 180ms cubic-bezier(0.23, 1, 0.32, 1) both",
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
