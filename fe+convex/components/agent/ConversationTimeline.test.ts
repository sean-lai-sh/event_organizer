/**
 * Tests for the pure logic extracted from ConversationTimeline.
 *
 * We test state-machine logic by extracting it as pure functions — the same
 * pattern used across this codebase (see route.test.ts).  No React renderer
 * or jsdom needed.
 *
 * Sections:
 *   1. selectView        – which UI branch to render
 *   2. selectDisplayTraces – which trace steps to surface (the core anti-bleed guard)
 *   3. shouldClearPending  – when the optimistic bubble retires
 *   4. shouldClearTraces   – the runThreadIdRef guard on thread change
 *   5. initRunState        – bootstrapping isRunning from Convex on direct-URL nav
 *   6. deriveTitle         – thread title truncation
 *   7. formatTraceKind     – trace step label formatting
 */

import { describe, test, expect } from "bun:test";

/* ══════════════════════════════════════════════════════════════════════════ */
/*  1. selectView                                                             */
/* ══════════════════════════════════════════════════════════════════════════ */

type ViewKind = "pendingView" | "emptyState" | "skeletons" | "messages";

interface ViewParams {
  hasThread: boolean;
  loaded: boolean;
  pendingMessage: string | null;
  messagesLength: number;
  isRunning: boolean;
}

function selectView(p: ViewParams): ViewKind {
  if (!p.hasThread) {
    return p.pendingMessage ? "pendingView" : "emptyState";
  }
  if (!p.loaded) {
    return p.pendingMessage ? "pendingView" : "skeletons";
  }
  if (p.messagesLength === 0 && !p.isRunning) {
    return "emptyState";
  }
  return "messages";
}

describe("selectView — rendering branch", () => {
  describe("no thread selected", () => {
    test("emptyState when no pending message", () => {
      expect(selectView({ hasThread: false, loaded: true, pendingMessage: null, messagesLength: 0, isRunning: false })).toBe("emptyState");
    });
    test("pendingView immediately after the first send (before thread exists)", () => {
      expect(selectView({ hasThread: false, loaded: true, pendingMessage: "Hello!", messagesLength: 0, isRunning: true })).toBe("pendingView");
    });
  });

  describe("thread selected, Convex threadState not yet arrived", () => {
    test("skeletons when navigating directly to /agent/<id> with no send in flight", () => {
      expect(selectView({ hasThread: true, loaded: false, pendingMessage: null, messagesLength: 0, isRunning: false })).toBe("skeletons");
    });
    test("pendingView (not skeletons) while a send is in flight", () => {
      expect(selectView({ hasThread: true, loaded: false, pendingMessage: "Follow-up", messagesLength: 0, isRunning: true })).toBe("pendingView");
    });
  });

  describe("thread loaded, zero messages", () => {
    test("emptyState when idle — ThreadEmptyState branch no longer exists", () => {
      const result = selectView({ hasThread: true, loaded: true, pendingMessage: null, messagesLength: 0, isRunning: false });
      expect(result).toBe("emptyState");
      expect(result).not.toBe("threadEmptyState" as ViewKind);
    });
    test("messages when a run is in progress (ThinkingBubble must render)", () => {
      expect(selectView({ hasThread: true, loaded: true, pendingMessage: "Hi", messagesLength: 0, isRunning: true })).toBe("messages");
    });
  });

  describe("thread loaded, messages present", () => {
    test("messages when idle", () => {
      expect(selectView({ hasThread: true, loaded: true, pendingMessage: null, messagesLength: 4, isRunning: false })).toBe("messages");
    });
    test("messages during a follow-up run", () => {
      expect(selectView({ hasThread: true, loaded: true, pendingMessage: "Another question", messagesLength: 4, isRunning: true })).toBe("messages");
    });
  });

  describe("branch exhaustiveness", () => {
    test("every possible input yields a valid ViewKind", () => {
      const valid: ViewKind[] = ["pendingView", "emptyState", "skeletons", "messages"];
      const cases: ViewParams[] = [
        { hasThread: false, loaded: false, pendingMessage: null, messagesLength: 0, isRunning: false },
        { hasThread: false, loaded: false, pendingMessage: "hi", messagesLength: 0, isRunning: true  },
        { hasThread: false, loaded: true,  pendingMessage: null, messagesLength: 0, isRunning: false },
        { hasThread: false, loaded: true,  pendingMessage: "hi", messagesLength: 0, isRunning: true  },
        { hasThread: true,  loaded: false, pendingMessage: null, messagesLength: 0, isRunning: false },
        { hasThread: true,  loaded: false, pendingMessage: "hi", messagesLength: 0, isRunning: true  },
        { hasThread: true,  loaded: true,  pendingMessage: null, messagesLength: 0, isRunning: false },
        { hasThread: true,  loaded: true,  pendingMessage: "hi", messagesLength: 0, isRunning: true  },
        { hasThread: true,  loaded: true,  pendingMessage: null, messagesLength: 3, isRunning: false },
        { hasThread: true,  loaded: true,  pendingMessage: "hi", messagesLength: 3, isRunning: true  },
      ];
      for (const c of cases) expect(valid).toContain(selectView(c));
    });
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/*  2. selectDisplayTraces                                                    */
/*                                                                            */
/*  The most critical new behavior: traces from a PREVIOUS run must never    */
/*  flash when the user sends a follow-up message.  The guard relies on      */
/*  three conditions all being true simultaneously:                          */
/*    a) tracesVisible is set (user sent a message this session)             */
/*    b) Convex has delivered a run document (latestRunInternalId non-null)  */
/*    c) latestRunInternalId differs from the ID captured at send time       */
/*       (lastRunIdBeforeSend) — meaning a NEW run has arrived               */
/* ══════════════════════════════════════════════════════════════════════════ */

interface Trace { id: string; runId: string; summary: string }

function selectDisplayTraces(p: {
  tracesVisible: boolean;
  latestRunInternalId: string | null;
  lastRunIdBeforeSend: string | null;
  traces: Trace[];
}): Trace[] {
  return (
    p.tracesVisible &&
    p.latestRunInternalId &&
    p.latestRunInternalId !== p.lastRunIdBeforeSend
  )
    ? p.traces.filter((t) => t.runId === p.latestRunInternalId)
    : [];
}

const OLD_RUN = "run:aaa";
const NEW_RUN = "run:bbb";

const oldTraces: Trace[] = [
  { id: "t1", runId: OLD_RUN, summary: "Searching" },
  { id: "t2", runId: OLD_RUN, summary: "Fetching data" },
];
const newTraces: Trace[] = [
  { id: "t3", runId: NEW_RUN, summary: "Analyzing" },
];
const allTraces = [...oldTraces, ...newTraces];

describe("selectDisplayTraces — anti-bleed guard", () => {
  describe("gap between send and new run arriving (latestRunInternalId === lastRunIdBeforeSend)", () => {
    test("returns [] even with tracesVisible=true so old traces never flash", () => {
      expect(selectDisplayTraces({
        tracesVisible: true,
        latestRunInternalId: OLD_RUN,
        lastRunIdBeforeSend: OLD_RUN,   // same → gap still in progress
        traces: oldTraces,
      })).toEqual([]);
    });

    test("returns [] when Convex has not delivered any run yet (latestRunInternalId=null)", () => {
      expect(selectDisplayTraces({
        tracesVisible: true,
        latestRunInternalId: null,
        lastRunIdBeforeSend: null,
        traces: allTraces,
      })).toEqual([]);
    });
  });

  describe("new run has arrived (latestRunInternalId !== lastRunIdBeforeSend)", () => {
    test("returns only traces belonging to the current run", () => {
      const result = selectDisplayTraces({
        tracesVisible: true,
        latestRunInternalId: NEW_RUN,
        lastRunIdBeforeSend: OLD_RUN,
        traces: allTraces,
      });
      expect(result).toHaveLength(1);
      expect(result[0].runId).toBe(NEW_RUN);
    });

    test("returns all new-run traces, not just one", () => {
      const extraNewTrace: Trace = { id: "t4", runId: NEW_RUN, summary: "Reviewing" };
      const result = selectDisplayTraces({
        tracesVisible: true,
        latestRunInternalId: NEW_RUN,
        lastRunIdBeforeSend: OLD_RUN,
        traces: [...allTraces, extraNewTrace],
      });
      expect(result).toHaveLength(2);
      expect(result.every((t) => t.runId === NEW_RUN)).toBe(true);
    });

    test("returns [] when a run exists but tracesVisible is false (e.g. after 30s hide timer)", () => {
      expect(selectDisplayTraces({
        tracesVisible: false,
        latestRunInternalId: NEW_RUN,
        lastRunIdBeforeSend: OLD_RUN,
        traces: allTraces,
      })).toEqual([]);
    });

    test("returns [] when there are no traces for the new run yet", () => {
      const result = selectDisplayTraces({
        tracesVisible: true,
        latestRunInternalId: NEW_RUN,
        lastRunIdBeforeSend: OLD_RUN,
        traces: oldTraces, // no NEW_RUN traces yet
      });
      expect(result).toEqual([]);
    });
  });

  describe("first message (no previous run)", () => {
    test("shows traces once Convex delivers the first run (lastRunIdBeforeSend=null)", () => {
      const result = selectDisplayTraces({
        tracesVisible: true,
        latestRunInternalId: NEW_RUN,
        lastRunIdBeforeSend: null,      // no prior run captured
        traces: newTraces,
      });
      expect(result).toHaveLength(1);
      expect(result[0].runId).toBe(NEW_RUN);
    });
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/*  3. shouldClearPending                                                     */
/*                                                                            */
/*  The optimistic user bubble retires once Convex delivers more messages    */
/*  than existed at the moment the user hit Send.                            */
/* ══════════════════════════════════════════════════════════════════════════ */

function shouldClearPending(p: {
  pendingMessage: string | null;
  messagesLength: number;
  messagesAtSend: number;
}): boolean {
  return p.pendingMessage !== null && p.messagesLength > p.messagesAtSend;
}

describe("shouldClearPending — optimistic bubble lifecycle", () => {
  test("clears when Convex delivers more messages than were present at send time", () => {
    expect(shouldClearPending({ pendingMessage: "Hello", messagesLength: 3, messagesAtSend: 2 })).toBe(true);
  });

  test("does NOT clear when message count equals send-time count (Convex hasn't responded yet)", () => {
    expect(shouldClearPending({ pendingMessage: "Hello", messagesLength: 2, messagesAtSend: 2 })).toBe(false);
  });

  test("does NOT clear when message count is less than send-time count (impossible in practice, safe to guard)", () => {
    expect(shouldClearPending({ pendingMessage: "Hello", messagesLength: 1, messagesAtSend: 2 })).toBe(false);
  });

  test("does NOT clear when pendingMessage is already null (no double-clear)", () => {
    expect(shouldClearPending({ pendingMessage: null, messagesLength: 5, messagesAtSend: 2 })).toBe(false);
  });

  test("clears for a first message: messagesAtSend=0, Convex delivers 1 message", () => {
    expect(shouldClearPending({ pendingMessage: "First message", messagesLength: 1, messagesAtSend: 0 })).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/*  4. shouldClearTracesOnThreadChange                                        */
/*                                                                            */
/*  When the active thread changes, we clear tracesVisible — UNLESS the      */
/*  change is because onThreadCreated just fired for the current run.        */
/*  runThreadIdRef is set to the new thread's ID BEFORE onThreadCreated is   */
/*  called, so the effect can distinguish "real navigation" from "creation". */
/* ══════════════════════════════════════════════════════════════════════════ */

function shouldClearTracesOnThreadChange(p: {
  newThreadId: string | null | undefined;
  runThreadId: string | null;
}): boolean {
  return p.newThreadId !== p.runThreadId;
}

describe("shouldClearTracesOnThreadChange — runThreadIdRef guard", () => {
  test("clears when user navigates to a different thread", () => {
    expect(shouldClearTracesOnThreadChange({ newThreadId: "thread:B", runThreadId: "thread:A" })).toBe(true);
  });

  test("does NOT clear when onThreadCreated fires for the current run (IDs match)", () => {
    // runThreadIdRef is set to the new thread ID before onThreadCreated is called.
    expect(shouldClearTracesOnThreadChange({ newThreadId: "thread:new", runThreadId: "thread:new" })).toBe(false);
  });

  test("clears when thread becomes null (e.g. active thread was deleted)", () => {
    expect(shouldClearTracesOnThreadChange({ newThreadId: null, runThreadId: "thread:A" })).toBe(true);
  });

  test("clears when starting a new conversation via '+' button (thread goes null, runThreadId still set)", () => {
    expect(shouldClearTracesOnThreadChange({ newThreadId: null, runThreadId: "thread:A" })).toBe(true);
  });

  test("does NOT clear when both are null (initial render before any thread)", () => {
    expect(shouldClearTracesOnThreadChange({ newThreadId: null, runThreadId: null })).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/*  5. initRunState                                                           */
/*                                                                            */
/*  When navigating directly to /agent/<id>, the component must bootstrap    */
/*  isRunning and tracesVisible from the Convex run status rather than       */
/*  waiting for a handleSend call.  runInitialized prevents this from        */
/*  firing more than once per mount.                                         */
/* ══════════════════════════════════════════════════════════════════════════ */

interface RunStateInit {
  shouldInit: boolean;
  isRunning: boolean;
  tracesVisible: boolean;
}

function initRunState(p: {
  runInitialized: boolean;
  latestRunStatus: string | undefined;
}): RunStateInit {
  if (p.runInitialized || p.latestRunStatus === undefined) {
    return { shouldInit: false, isRunning: false, tracesVisible: false };
  }
  const active = p.latestRunStatus === "running";
  return { shouldInit: true, isRunning: active, tracesVisible: active };
}

describe("initRunState — direct-URL navigation bootstrap", () => {
  test("initialises isRunning=true and tracesVisible=true when run is in progress", () => {
    const result = initRunState({ runInitialized: false, latestRunStatus: "running" });
    expect(result.shouldInit).toBe(true);
    expect(result.isRunning).toBe(true);
    expect(result.tracesVisible).toBe(true);
  });

  test("initialises with isRunning=false when run is already completed", () => {
    const result = initRunState({ runInitialized: false, latestRunStatus: "completed" });
    expect(result.shouldInit).toBe(true);
    expect(result.isRunning).toBe(false);
    expect(result.tracesVisible).toBe(false);
  });

  test("does NOT re-initialise when runInitialized is already true (prevents repeated calls)", () => {
    const result = initRunState({ runInitialized: true, latestRunStatus: "running" });
    expect(result.shouldInit).toBe(false);
  });

  test("does NOT initialise when Convex has not yet returned a status (undefined)", () => {
    const result = initRunState({ runInitialized: false, latestRunStatus: undefined });
    expect(result.shouldInit).toBe(false);
  });

  test("handles error status — does not set running", () => {
    const result = initRunState({ runInitialized: false, latestRunStatus: "error" });
    expect(result.shouldInit).toBe(true);
    expect(result.isRunning).toBe(false);
  });

  test("handles paused_approval status — does not set running", () => {
    const result = initRunState({ runInitialized: false, latestRunStatus: "paused_approval" });
    expect(result.shouldInit).toBe(true);
    expect(result.isRunning).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/*  6. deriveTitle                                                            */
/* ══════════════════════════════════════════════════════════════════════════ */

function deriveTitle(text: string): string {
  const MAX = 60;
  const trimmed = text.trim();
  if (trimmed.length <= MAX) return trimmed;
  const cut = trimmed.slice(0, MAX);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut) + "…";
}

describe("deriveTitle — thread title derivation", () => {
  test("returns text unchanged when under the 60-char limit", () => {
    expect(deriveTitle("Short message")).toBe("Short message");
  });

  test("trims leading/trailing whitespace before measuring", () => {
    expect(deriveTitle("  hello  ")).toBe("hello");
  });

  test("returns exact 60-char text unchanged", () => {
    const exactly60 = "a".repeat(60);
    expect(deriveTitle(exactly60)).toBe(exactly60);
  });

  test("truncates at the last word boundary when a space exists after position 20", () => {
    const text = "Can you help me find all speakers who specialise in machine learning for the summit?";
    const result = deriveTitle(text);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThan(text.length);
    // Must not cut mid-word
    const withoutEllipsis = result.slice(0, -1);
    expect(text.startsWith(withoutEllipsis)).toBe(true);
  });

  test("falls back to hard cut at 60 chars when no space appears after position 20", () => {
    // A 70-char word with no spaces — the last space is at position -1 (none found,
    // lastIndexOf returns -1 which is not > 20) so it hard-cuts at 60.
    const longWord = "x".repeat(70);
    const result = deriveTitle(longWord);
    expect(result).toBe("x".repeat(60) + "…");
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/*  7. formatTraceKind                                                        */
/* ══════════════════════════════════════════════════════════════════════════ */

function formatTraceKind(kind: string): string {
  return kind
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

describe("formatTraceKind — trace label formatting", () => {
  test("converts snake_case to Title Case", () => {
    expect(formatTraceKind("tool_start")).toBe("Tool Start");
  });

  test("handles single-word kinds", () => {
    expect(formatTraceKind("thinking")).toBe("Thinking");
  });

  test("handles three-part kinds", () => {
    expect(formatTraceKind("tool_completion_result")).toBe("Tool Completion Result");
  });

  test("preserves capitalisation within words beyond the first character", () => {
    expect(formatTraceKind("tool_use")).toBe("Tool Use");
  });

  test("handles already-capitalised input gracefully", () => {
    expect(formatTraceKind("Thinking")).toBe("Thinking");
  });
});
