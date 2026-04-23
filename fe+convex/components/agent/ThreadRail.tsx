"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { MessageSquare, MoreHorizontal, Plus, Zap } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { AgentThread } from "./types";

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

type ConvexThread = {
  external_id: string;
  channel: string;
  title?: string | null;
  summary?: string | null;
  last_message_at?: number | null;
  last_run_started_at?: number | null;
  updated_at: number;
};

function mapConvexThread(t: ConvexThread): AgentThread {
  return {
    id: t.external_id,
    title: t.title ?? "New conversation",
    channel: t.channel as AgentThread["channel"],
    lastMessage: t.summary ?? undefined,
    lastActivityAt:
      t.last_message_at ?? t.last_run_started_at ?? t.updated_at,
  };
}

const THREADS_CACHE_KEY = "agent_threads_v1";

export function ThreadRail({
  activeThreadId,
  activeThread,
  onSelectThread,
  onStartNewConversation,
  onRenameThread,
  onDeleteThread,
}: ThreadRailProps) {
  const rawThreads = useQuery(api.agentState.listThreads, { limit: 50 });
  const pendingThreadIds = useQuery(api.agentState.listThreadsWithPendingApprovals) ?? [];
  const pendingSet = new Set(pendingThreadIds);

  // ── localStorage cache ────────────────────────────────────────────────────
  // Populated from localStorage on mount so the list renders immediately
  // instead of showing a skeleton on every page load.
  const [cachedRaw, setCachedRaw] = useState<ConvexThread[]>([]);

  // Tracks which thread IDs have already been shown so we only animate
  // threads that are genuinely new (e.g. just created), not every re-render.
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    try {
      const stored = localStorage.getItem(THREADS_CACHE_KEY);
      if (stored) {
        const parsed: ConvexThread[] = JSON.parse(stored);
        setCachedRaw(parsed);
        // Pre-populate seenIds so cached threads don't animate on first render.
        parsed.forEach((t) => seenIdsRef.current.add(t.external_id));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!rawThreads) return;
    const raw = rawThreads as unknown as ConvexThread[];
    setCachedRaw(raw);
    try {
      localStorage.setItem(THREADS_CACHE_KEY, JSON.stringify(raw));
    } catch { /* ignore */ }
  }, [rawThreads]);

  const threads: AgentThread[] = useMemo(
    () => (rawThreads
      ? (rawThreads as unknown as ConvexThread[])
      : cachedRaw
    ).map(mapConvexThread),
    [rawThreads, cachedRaw],
  );

  // After threads change, mark displayed threads as seen so future Convex
  // updates (reordering, metadata changes) don't re-trigger the animation.
  useEffect(() => {
    threads.forEach((t) => seenIdsRef.current.add(t.id));
  }, [threads]);
  const loaded = rawThreads !== undefined || cachedRaw.length > 0;

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
  const menuRef = useRef<HTMLDivElement | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);

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
      // Thread list will update reactively via Convex query.
      cancelRename();
    } finally {
      setBusyThreadId(null);
    }
  }

  async function handleDelete(threadId: string) {
    setBusyThreadId(threadId);
    try {
      await onDeleteThread(threadId);
      // Thread list will update reactively via Convex query.
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
              const isNew = !seenIdsRef.current.has(thread.id);
              const hasPending = pendingSet.has(thread.id);
              return (
                <li
                  key={thread.id}
                  style={isNew ? { animationDelay: `${i * 40}ms`, animationFillMode: "both" } : undefined}
                  className={`${isNew ? "thread-item-enter " : ""}group relative`}
                >
                  <button
                    onClick={() => {
                      if (!editing && !busy) onSelectThread(thread);
                    }}
                    disabled={busy}
                    className={`group w-full rounded-[8px] px-3 py-2.5 pr-9 text-left transition-colors duration-100 ${
                      hasPending
                        ? "border border-orange-400" + (active ? " bg-[#EAEAEA]" : " hover:bg-[#EFEFEF]")
                        : active
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
                    className={`absolute right-2 top-3 flex h-6 w-6 items-center justify-center rounded-[5px] text-[#BBBBBB] transition-all duration-100 ${
                      menuOpen
                        ? "bg-[#E0E0E0] text-[#555555]"
                        : "opacity-0 hover:bg-[#E0E0E0] hover:text-[#555555] group-hover:opacity-100"
                    }`}
                    aria-label="Thread options"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {openMenuThread && (
        <div
          ref={menuRef}
          className="fixed z-50 w-[132px] overflow-hidden rounded-[8px] border border-[#E0E0E0] bg-[#FFFFFF] py-1 shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
          style={{
            top: openMenuPosition.top,
            left: openMenuPosition.left,
            animation: "menuFadeIn 120ms ease-out both",
          }}
        >
          <button
            onClick={() => startRename(openMenuThread)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-[#333333] transition-colors duration-75 hover:bg-[#F4F4F4]"
          >
            Rename
          </button>
          <button
            onClick={() => void handleDelete(openMenuThread.id)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-[#CC3333] transition-colors duration-75 hover:bg-[#FFF0F0]"
          >
            Delete
          </button>
        </div>
      )}

      <style>{`
        @keyframes menuFadeIn {
          from { opacity: 0; transform: translateY(-4px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes threadItemEnter {
          from { opacity: 0; transform: translateX(-6px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .thread-item-enter {
          animation: threadItemEnter 200ms ease-out;
        }
      `}</style>
    </aside>
  );
}

function ThreadSkeletons() {
  return (
    <div className="space-y-1 px-2">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-[52px] animate-pulse rounded-[8px] bg-[#F0F0F0]"
        />
      ))}
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 pt-8 text-center">
      <p className="text-[12.5px] text-[#BBBBBB]">No conversations yet.</p>
      <button
        onClick={onNew}
        className="rounded-[6px] border border-[#E0E0E0] px-3 py-1.5 text-[12px] font-medium text-[#555555] transition-colors duration-100 hover:bg-[#F4F4F4]"
      >
        Start a conversation
      </button>
    </div>
  );
}
