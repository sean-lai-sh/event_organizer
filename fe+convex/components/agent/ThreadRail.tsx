"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { Id } from "@/convex/_generated/dataModel";
import type { FunctionReference } from "convex/server";
import { useMutation } from "convex/react";
import { MessageSquare, MoreHorizontal, Plus, Zap } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { AgentThread } from "./types";
import { listThreads, createThread } from "./adapters/mock";

interface ThreadRailProps {
  activeThreadId: string | null;
  activeThread?: AgentThread | null;
  onSelectThread: (thread: AgentThread) => void;
  onStartNewConversation: () => void;
  onRenameThread: (threadId: string, title: string) => Promise<void> | void;
  onDeleteThread: (threadId: string) => Promise<void> | void;
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

export function ThreadRail({
  activeThreadId,
  activeThread,
  onSelectThread,
  onStartNewConversation,
  onRenameThread,
  onDeleteThread,
}: ThreadRailProps) {
  const agentApi = (
    api as unknown as {
      agent: {
        deleteThread: FunctionReference<"mutation", "public">;
      };
    }
  ).agent;
  const deleteThreadMutation = useMutation(agentApi.deleteThread);
  const [threads, setThreads] = useState<AgentThread[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openMenuThreadId, setOpenMenuThreadId] = useState<string | null>(null);
  const [openMenuPosition, setOpenMenuPosition] = useState<{
    top: number;
    left: number;
  }>({
    top: 0,
    left: 0,
  });
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [busyThreadId, setBusyThreadId] = useState<string | null>(null);
  const mounted = useRef(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        target.closest('[data-thread-menu-trigger="true"]')
      )
        return;
      setOpenMenuThreadId(null);
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    if (!editingThreadId || !editInputRef.current) return;
    editInputRef.current.focus();
    editInputRef.current.select();
  }, [editingThreadId]);

  const displayedThreads = useMemo(() => {
    if (!activeThread) return threads;
    if (threads.some((thread) => thread.id === activeThread.id)) return threads;
    return [activeThread, ...threads];
  }, [activeThread, threads]);
  const openMenuThread = useMemo(
    () =>
      displayedThreads.find((thread) => thread.id === openMenuThreadId) ?? null,
    [displayedThreads, openMenuThreadId],
  );

  function handleNew() {
    setOpenMenuThreadId(null);
    setEditingThreadId(null);
    onStartNewConversation();
  }

  function startRename(thread: AgentThread) {
    setEditingThreadId(thread.id);
    setEditingTitle(thread.title);
    setOpenMenuThreadId(null);
  }

  function cancelRename() {
    setEditingThreadId(null);
    setEditingTitle("");
  }

  async function saveRename(threadId: string) {
    const nextTitle = editingTitle.trim();
    if (!nextTitle) {
      cancelRename();
      return;
    }

    const previousTitle =
      displayedThreads.find((thread) => thread.id === threadId)?.title ?? "";
    if (nextTitle === previousTitle) {
      cancelRename();
      return;
    }

    setBusyThreadId(threadId);
    try {
      await onRenameThread(threadId, nextTitle);
      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === threadId ? { ...thread, title: nextTitle } : thread,
        ),
      );
      cancelRename();
    } finally {
      setBusyThreadId(null);
    }
  }

  async function handleDelete(threadId: string) {
    setBusyThreadId(threadId);
    try {
      const thread = displayedThreads.find((t) => t.id === threadId);
      if (thread?._id) {
        await deleteThreadMutation({ id: thread._id as Id<"agent_threads"> });
      }
      await onDeleteThread(threadId);
      setThreads((prev) => prev.filter((thread) => thread.id !== threadId));
      if (editingThreadId === threadId) {
        cancelRename();
      }
      if (openMenuThreadId === threadId) {
        setOpenMenuThreadId(null);
      }
    } finally {
      setBusyThreadId(null);
    }
  }

  function handleRenameKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    threadId: string,
  ) {
    if (event.key === "Enter") {
      event.preventDefault();
      void saveRename(threadId);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelRename();
    }
  }

  function getMenuSide(button: HTMLButtonElement): "left" | "right" {
    const MENU_WIDTH = 132;
    const GAP = 6;
    const rect = button.getBoundingClientRect();
    const spaceRight = window.innerWidth - rect.right;
    const spaceLeft = rect.left;
    if (spaceRight >= MENU_WIDTH + GAP) return "right";
    if (spaceLeft >= MENU_WIDTH + GAP) return "left";
    return spaceRight >= spaceLeft ? "right" : "left";
  }

  function getMenuPosition(button: HTMLButtonElement, side: "left" | "right") {
    const MENU_WIDTH = 132;
    const GAP = 6;
    const rect = button.getBoundingClientRect();
    return {
      top: rect.top,
      left: side === "right" ? rect.right + GAP : rect.left - MENU_WIDTH - GAP,
    };
  }

  return (
    <aside
      className="flex h-full w-60 flex-col overflow-visible border-r border-[#EBEBEB] bg-[#FAFAFA]"
      style={{ minWidth: 0 }}
    >
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
          className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#999999] transition-colors duration-150 hover:bg-[#EBEBEB] hover:text-[#0A0A0A] active:scale-95"
          style={{
            transition:
              "transform 120ms ease-out, background-color 120ms ease-out",
          }}
          aria-label="New conversation"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-visible py-2">
        {!loaded ? (
          <ThreadSkeletons />
        ) : displayedThreads.length === 0 ? (
          <EmptyState onNew={handleNew} />
        ) : (
          <ul className="space-y-px overflow-visible px-2">
            {displayedThreads.map((thread, i) => {
              const active = thread.id === activeThreadId;
              const menuOpen = openMenuThreadId === thread.id;
              const editing = editingThreadId === thread.id;
              const busy = busyThreadId === thread.id;
              return (
                <li
                  key={thread.id}
                  style={{
                    animationDelay: `${i * 40}ms`,
                    animationFillMode: "both",
                  }}
                  className="thread-item-enter group relative"
                >
                  <button
                    onClick={() => {
                      if (!editing && !busy) onSelectThread(thread);
                    }}
                    disabled={busy}
                    className={`group w-full rounded-[8px] px-3 py-2.5 pr-9 text-left transition-colors duration-100 ${
                      active
                        ? "border border-[#CFCFCF] bg-[#EAEAEA]"
                        : "border border-transparent hover:bg-[#EFEFEF]"
                    } ${busy ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      <MessageSquare
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                          active ? "text-[#0A0A0A]" : "text-[#BBBBBB]"
                        }`}
                        strokeWidth={1.8}
                      />
                      <div className="min-w-0 flex-1">
                        {editing ? (
                          <input
                            ref={editInputRef}
                            value={editingTitle}
                            onChange={(event) =>
                              setEditingTitle(event.target.value)
                            }
                            onKeyDown={(event) =>
                              handleRenameKeyDown(event, thread.id)
                            }
                            onBlur={() => cancelRename()}
                            className="w-full rounded-[6px] border border-[#D8D8D8] bg-[#FFFFFF] px-2 py-1 text-[12.5px] font-medium leading-snug text-[#111111] outline-none"
                            style={{ fontFamily: "var(--font-geist-sans)" }}
                          />
                        ) : (
                          <p
                            className={`truncate text-[12.5px] font-medium leading-snug ${
                              active ? "text-[#0A0A0A]" : "text-[#333333]"
                            }`}
                          >
                            {thread.title}
                          </p>
                        )}
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

                  <button
                    type="button"
                    data-thread-menu-trigger="true"
                    onClick={(event) => {
                      event.stopPropagation();
                      const nextOpen = openMenuThreadId !== thread.id;
                      if (nextOpen) {
                        const side = getMenuSide(event.currentTarget);
                        setOpenMenuPosition(
                          getMenuPosition(event.currentTarget, side),
                        );
                      }
                      setOpenMenuThreadId(nextOpen ? thread.id : null);
                    }}
                    className={`absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-[6px] border border-transparent text-[#888888] transition-colors hover:bg-[#EDEDED] hover:text-[#222222] ${
                      menuOpen
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100"
                    }`}
                    aria-label="Thread actions"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.9} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {openMenuThread && editingThreadId !== openMenuThread.id ? (
        <div
          ref={menuRef}
          className="fixed z-[9999] w-[132px] overflow-hidden rounded-[8px] border border-[#E5E5E5] bg-[#FFFFFF] py-1 shadow-[0_8px_20px_rgba(0,0,0,0.08)]"
          style={{ top: openMenuPosition.top, left: openMenuPosition.left }}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              startRename(openMenuThread);
            }}
            className="block w-full px-4 py-2 text-left text-[12px] text-[#222222] transition-colors hover:bg-[#F4F4F4]"
          >
            Rename
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void handleDelete(openMenuThread.id);
            }}
            className="block w-full px-4 py-2 text-left text-[12px] text-red-600 transition-colors hover:bg-[#F4F4F4]"
          >
            Delete
          </button>
        </div>
      ) : null}

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
