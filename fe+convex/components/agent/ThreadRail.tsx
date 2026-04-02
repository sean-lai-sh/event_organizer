"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquare, Plus, Zap } from "lucide-react";
import type { AgentThread } from "./types";
import { listThreads, createThread } from "./adapters/runtime";

interface ThreadRailProps {
  activeThreadId: string | null;
  onSelectThread: (thread: AgentThread) => void;
  onNewThread: (thread: AgentThread) => void;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function ThreadRail({ activeThreadId, onSelectThread, onNewThread }: ThreadRailProps) {
  const [threads, setThreads] = useState<AgentThread[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    listThreads().then((data) => {
      if (mounted.current) {
        setThreads(data);
        setLoaded(true);
      }
    });
    return () => {
      mounted.current = false;
    };
  }, []);

  async function handleNew() {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const thread = await createThread();
      setThreads((prev) => [thread, ...prev]);
      onNewThread(thread);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <aside
      className="flex h-full w-60 flex-col border-r border-[#EBEBEB] bg-[#FAFAFA]"
      style={{ minWidth: 0 }}
    >
      {/* Header */}
      <div className="flex h-[60px] items-center justify-between border-b border-[#EBEBEB] px-4">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-[#0A0A0A]" strokeWidth={1.9} />
          <span
            className="text-[13px] font-semibold tracking-[-0.01em] text-[#111111]"
            style={{ fontFamily: "var(--font-geist-sans)" }}
          >
            Agent
          </span>
        </div>
        <button
          onClick={handleNew}
          disabled={isCreating}
          className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#999999] transition-colors duration-150 hover:bg-[#EBEBEB] hover:text-[#0A0A0A] active:scale-95 disabled:opacity-40"
          style={{ transition: "transform 120ms ease-out, background-color 120ms ease-out" }}
          aria-label="New conversation"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto py-2">
        {!loaded ? (
          <ThreadSkeletons />
        ) : threads.length === 0 ? (
          <EmptyState onNew={handleNew} />
        ) : (
          <ul className="space-y-px px-2">
            {threads.map((thread, i) => {
              const active = thread.id === activeThreadId;
              return (
                <li
                  key={thread.id}
                  style={{
                    animationDelay: `${i * 40}ms`,
                    animationFillMode: "both",
                  }}
                  className="thread-item-enter"
                >
                  <button
                    onClick={() => onSelectThread(thread)}
                    className={`group w-full rounded-[8px] px-3 py-2.5 text-left transition-colors duration-100 ${
                      active
                        ? "border border-[#CFCFCF] bg-[#EAEAEA]"
                        : "border border-transparent hover:bg-[#EFEFEF]"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <MessageSquare
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                          active ? "text-[#0A0A0A]" : "text-[#BBBBBB]"
                        }`}
                        strokeWidth={1.8}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-[12.5px] font-medium leading-snug ${
                            active ? "text-[#0A0A0A]" : "text-[#333333]"
                          }`}
                        >
                          {thread.title}
                        </p>
                        {thread.lastMessage ? (
                          <p className="mt-0.5 truncate text-[11.5px] text-[#999999]">
                            {thread.lastMessage}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <p className="mt-1.5 pl-5 text-[10.5px] text-[#BBBBBB]">
                      {timeAgo(thread.lastActivityAt)}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <style>{`
        @keyframes threadItemIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .thread-item-enter {
          animation: threadItemIn 200ms cubic-bezier(0.23, 1, 0.32, 1) both;
        }
      `}</style>
    </aside>
  );
}

function ThreadSkeletons() {
  return (
    <div className="space-y-px px-2 py-1">
      {[80, 65, 72].map((w, i) => (
        <div key={i} className="rounded-[8px] px-3 py-2.5">
          <div className="h-2.5 w-3/4 animate-pulse rounded-full bg-[#E8E8E8]" />
          <div
            className="mt-1.5 animate-pulse rounded-full bg-[#EFEFEF]"
            style={{ height: 9, width: `${w}%` }}
          />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="px-4 py-8 text-center">
      <p className="text-[12px] text-[#BBBBBB]">No conversations yet.</p>
      <button
        onClick={onNew}
        className="mt-3 text-[12px] font-medium text-[#555555] underline-offset-2 hover:underline"
      >
        Start one
      </button>
    </div>
  );
}
