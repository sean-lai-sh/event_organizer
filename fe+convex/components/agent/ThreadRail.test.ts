/**
 * Tests for pure logic extracted from ThreadRail.
 *
 * Sections:
 *   1. timeAgo          – human-readable relative timestamps
 *   2. mapConvexThread  – Convex document → AgentThread shape
 *   3. animation guard  – seenIdsRef logic (isNew check)
 *   4. displayedThreads – activeThread merge-in logic
 */

import { describe, test, expect } from "bun:test";

/* ══════════════════════════════════════════════════════════════════════════ */
/*  1. timeAgo                                                                */
/* ══════════════════════════════════════════════════════════════════════════ */

function timeAgo(ts: number, now = Date.now()): string {
  const diff = now - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const NOW = 1_700_000_000_000; // fixed reference point

describe("timeAgo — relative timestamp formatting", () => {
  test("returns 'just now' for a timestamp less than a minute ago", () => {
    expect(timeAgo(NOW - 30_000, NOW)).toBe("just now");
  });

  test("returns 'just now' for a timestamp exactly at now", () => {
    expect(timeAgo(NOW, NOW)).toBe("just now");
  });

  test("returns minutes for timestamps 1–59 minutes ago", () => {
    expect(timeAgo(NOW - 60_000, NOW)).toBe("1m ago");
    expect(timeAgo(NOW - 59 * 60_000, NOW)).toBe("59m ago");
  });

  test("returns hours for timestamps 1–23 hours ago", () => {
    expect(timeAgo(NOW - 60 * 60_000, NOW)).toBe("1h ago");
    expect(timeAgo(NOW - 23 * 60 * 60_000, NOW)).toBe("23h ago");
  });

  test("returns days for timestamps 24+ hours ago", () => {
    expect(timeAgo(NOW - 24 * 60 * 60_000, NOW)).toBe("1d ago");
    expect(timeAgo(NOW - 7 * 24 * 60 * 60_000, NOW)).toBe("7d ago");
  });

  test("floors fractional minutes (e.g. 90 seconds → 1m ago)", () => {
    expect(timeAgo(NOW - 90_000, NOW)).toBe("1m ago");
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/*  2. mapConvexThread                                                        */
/*                                                                            */
/*  Convex documents use snake_case and nullable fields.  The mapper         */
/*  normalises them into the AgentThread shape used by the UI.               */
/* ══════════════════════════════════════════════════════════════════════════ */

type ConvexThread = {
  external_id: string;
  channel: string;
  title?: string | null;
  summary?: string | null;
  last_message_at?: number | null;
  last_run_started_at?: number | null;
  updated_at: number;
};

type AgentThread = {
  id: string;
  title: string;
  channel: string;
  lastMessage?: string;
  lastActivityAt: number;
};

function mapConvexThread(t: ConvexThread): AgentThread {
  return {
    id: t.external_id,
    title: t.title ?? "New conversation",
    channel: t.channel,
    lastMessage: t.summary ?? undefined,
    lastActivityAt: t.last_message_at ?? t.last_run_started_at ?? t.updated_at,
  };
}

describe("mapConvexThread — Convex document normalisation", () => {
  test("maps external_id to id", () => {
    const result = mapConvexThread({ external_id: "th_abc", channel: "web", updated_at: 1000 });
    expect(result.id).toBe("th_abc");
  });

  test("uses explicit title when present", () => {
    const result = mapConvexThread({ external_id: "th_1", channel: "web", title: "My thread", updated_at: 1000 });
    expect(result.title).toBe("My thread");
  });

  test("falls back to 'New conversation' when title is null", () => {
    const result = mapConvexThread({ external_id: "th_1", channel: "web", title: null, updated_at: 1000 });
    expect(result.title).toBe("New conversation");
  });

  test("falls back to 'New conversation' when title is undefined", () => {
    const result = mapConvexThread({ external_id: "th_1", channel: "web", updated_at: 1000 });
    expect(result.title).toBe("New conversation");
  });

  test("maps summary to lastMessage", () => {
    const result = mapConvexThread({ external_id: "th_1", channel: "web", summary: "Found 3 speakers", updated_at: 1000 });
    expect(result.lastMessage).toBe("Found 3 speakers");
  });

  test("sets lastMessage to undefined when summary is null", () => {
    const result = mapConvexThread({ external_id: "th_1", channel: "web", summary: null, updated_at: 1000 });
    expect(result.lastMessage).toBeUndefined();
  });

  test("uses last_message_at as lastActivityAt when available", () => {
    const result = mapConvexThread({
      external_id: "th_1", channel: "web",
      last_message_at: 9000, last_run_started_at: 5000, updated_at: 1000,
    });
    expect(result.lastActivityAt).toBe(9000);
  });

  test("falls back to last_run_started_at when last_message_at is null", () => {
    const result = mapConvexThread({
      external_id: "th_1", channel: "web",
      last_message_at: null, last_run_started_at: 5000, updated_at: 1000,
    });
    expect(result.lastActivityAt).toBe(5000);
  });

  test("falls back to updated_at when both message and run timestamps are null", () => {
    const result = mapConvexThread({
      external_id: "th_1", channel: "web",
      last_message_at: null, last_run_started_at: null, updated_at: 1000,
    });
    expect(result.lastActivityAt).toBe(1000);
  });

  test("passes channel through unchanged", () => {
    expect(mapConvexThread({ external_id: "th_1", channel: "discord", updated_at: 1 }).channel).toBe("discord");
    expect(mapConvexThread({ external_id: "th_2", channel: "web",     updated_at: 1 }).channel).toBe("web");
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/*  3. Animation guard — seenIdsRef logic                                     */
/*                                                                            */
/*  Thread items only receive the slide-in CSS animation when their ID has   */
/*  NOT been rendered before.  seenIdsRef is a persistent Set that survives  */
/*  re-renders; it's pre-populated from the localStorage cache on mount so   */
/*  cached threads never animate.                                            */
/* ══════════════════════════════════════════════════════════════════════════ */

function isNewThread(seenIds: Set<string>, threadId: string): boolean {
  return !seenIds.has(threadId);
}

describe("isNewThread — slide-in animation guard", () => {
  test("returns true for a thread ID not yet in the seen set", () => {
    const seen = new Set(["th_A", "th_B"]);
    expect(isNewThread(seen, "th_C")).toBe(true);
  });

  test("returns false for a thread ID already in the seen set", () => {
    const seen = new Set(["th_A", "th_B"]);
    expect(isNewThread(seen, "th_A")).toBe(false);
  });

  test("returns true for an empty seen set (cold start, no localStorage cache)", () => {
    expect(isNewThread(new Set(), "th_X")).toBe(true);
  });

  test("returns false once a thread has been marked as seen", () => {
    const seen = new Set<string>();
    expect(isNewThread(seen, "th_new")).toBe(true);
    seen.add("th_new"); // simulate the post-render useEffect
    expect(isNewThread(seen, "th_new")).toBe(false);
  });

  test("pre-populating from cache means cached threads are never new", () => {
    const cache: ConvexThread[] = [
      { external_id: "th_cached_1", channel: "web", updated_at: 1 },
      { external_id: "th_cached_2", channel: "web", updated_at: 2 },
    ];
    const seen = new Set<string>();
    // Simulate the mount effect that pre-populates seenIds from localStorage.
    cache.forEach((t) => seen.add(t.external_id));

    expect(isNewThread(seen, "th_cached_1")).toBe(false);
    expect(isNewThread(seen, "th_cached_2")).toBe(false);
    // A thread that wasn't in the cache IS new.
    expect(isNewThread(seen, "th_brand_new")).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/*  4. displayedThreads — activeThread merge-in                               */
/*                                                                            */
/*  If the active thread isn't in the Convex list yet (e.g. just created),  */
/*  it's prepended so the rail always shows the current conversation.        */
/* ══════════════════════════════════════════════════════════════════════════ */

function computeDisplayedThreads(
  threads: AgentThread[],
  activeThread: AgentThread | null | undefined,
): AgentThread[] {
  if (!activeThread) return threads;
  if (threads.some((t) => t.id === activeThread.id)) return threads;
  return [activeThread, ...threads];
}

describe("computeDisplayedThreads — active thread merge", () => {
  const threadA: AgentThread = { id: "th_A", title: "Thread A", channel: "web", lastActivityAt: 1000 };
  const threadB: AgentThread = { id: "th_B", title: "Thread B", channel: "web", lastActivityAt: 2000 };

  test("returns the list unchanged when activeThread is null", () => {
    expect(computeDisplayedThreads([threadA, threadB], null)).toEqual([threadA, threadB]);
  });

  test("returns the list unchanged when activeThread is already in it", () => {
    expect(computeDisplayedThreads([threadA, threadB], threadA)).toEqual([threadA, threadB]);
  });

  test("prepends activeThread when it is not yet in the Convex list", () => {
    const newThread: AgentThread = { id: "th_new", title: "New", channel: "web", lastActivityAt: 9999 };
    const result = computeDisplayedThreads([threadA, threadB], newThread);
    expect(result[0]).toEqual(newThread);
    expect(result).toHaveLength(3);
  });

  test("returns [activeThread] when Convex list is empty and thread is new", () => {
    const newThread: AgentThread = { id: "th_new", title: "New", channel: "web", lastActivityAt: 9999 };
    expect(computeDisplayedThreads([], newThread)).toEqual([newThread]);
  });
});
