/**
 * Tests for the view-branch selection logic in ConversationTimeline.
 *
 * ConversationTimeline picks one of four views based on a small set of
 * boolean flags.  We extract that decision into a pure function here so
 * we can pin every branch without spinning up a React renderer.
 *
 * Branches (in evaluation order, matching the component's JSX):
 *   "pendingView"  – show optimistic user-bubble + thinking state
 *   "emptyState"   – show the injected emptyState prop / inline placeholder
 *   "skeletons"    – show MessageSkeletons while Convex delivers threadState
 *   "messages"     – show the real message list
 *
 * Key invariant:  there is NO "threadEmptyState" branch.  The old
 * ThreadEmptyState component was removed; that path now falls through
 * to "emptyState".
 */

import { describe, test, expect } from "bun:test";

type ViewKind = "pendingView" | "emptyState" | "skeletons" | "messages";

interface ViewParams {
  /** Whether a thread has been selected / created yet. */
  hasThread: boolean;
  /** Whether Convex has returned the threadState document (or no thread selected). */
  loaded: boolean;
  /** Optimistic user message text, set immediately on send before Convex responds. */
  pendingMessage: string | null;
  /** Number of real messages returned by Convex. */
  messagesLength: number;
  /** True while the agent run is in progress. */
  isRunning: boolean;
}

/**
 * Pure function that mirrors the conditional rendering logic in
 * ConversationTimeline's JSX.  Keep this in sync with the component.
 */
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

describe("ConversationTimeline view-branch selection", () => {
  // ── no thread yet ────────────────────────────────────────────────────────
  describe("when no thread is selected", () => {
    test("shows emptyState when there is no pending message", () => {
      expect(
        selectView({ hasThread: false, loaded: true, pendingMessage: null, messagesLength: 0, isRunning: false })
      ).toBe("emptyState");
    });

    test("shows pendingView immediately after the user sends the first message", () => {
      expect(
        selectView({ hasThread: false, loaded: true, pendingMessage: "Hello!", messagesLength: 0, isRunning: true })
      ).toBe("pendingView");
    });
  });

  // ── thread exists, Convex has not responded yet (loaded === false) ────────
  describe("when a thread is selected but threadState has not arrived", () => {
    test("shows skeletons when there is no pending message (e.g. navigating directly to /agent/<id>)", () => {
      expect(
        selectView({ hasThread: true, loaded: false, pendingMessage: null, messagesLength: 0, isRunning: false })
      ).toBe("skeletons");
    });

    test("shows pendingView (not skeletons) while a send is in flight and Convex has not yet responded", () => {
      expect(
        selectView({ hasThread: true, loaded: false, pendingMessage: "Follow-up question", messagesLength: 0, isRunning: true })
      ).toBe("pendingView");
    });
  });

  // ── thread loaded, no messages yet ───────────────────────────────────────
  describe("when the thread loads with zero messages", () => {
    test("shows emptyState (NOT a separate ThreadEmptyState) when idle", () => {
      // This is the critical invariant: ThreadEmptyState no longer exists.
      // The branch MUST return "emptyState", not a distinct "threadEmptyState".
      expect(
        selectView({ hasThread: true, loaded: true, pendingMessage: null, messagesLength: 0, isRunning: false })
      ).toBe("emptyState");

      // The result must not be a hypothetical removed branch.
      const result = selectView({ hasThread: true, loaded: true, pendingMessage: null, messagesLength: 0, isRunning: false });
      expect(result).not.toBe("threadEmptyState" as ViewKind);
    });

    test("shows messages (run in progress) even with zero real messages", () => {
      // isRunning === true puts us in the messages branch so the ThinkingBubble renders.
      expect(
        selectView({ hasThread: true, loaded: true, pendingMessage: "Hi", messagesLength: 0, isRunning: true })
      ).toBe("messages");
    });
  });

  // ── thread loaded, real messages present ─────────────────────────────────
  describe("when the thread loads with messages", () => {
    test("shows messages when there is conversation history", () => {
      expect(
        selectView({ hasThread: true, loaded: true, pendingMessage: null, messagesLength: 4, isRunning: false })
      ).toBe("messages");
    });

    test("shows messages while a follow-up run is in progress", () => {
      expect(
        selectView({ hasThread: true, loaded: true, pendingMessage: "Another question", messagesLength: 4, isRunning: true })
      ).toBe("messages");
    });
  });

  // ── exhaustive coverage of every branch ──────────────────────────────────
  describe("branch exhaustiveness", () => {
    test("every returned view is one of the four known kinds", () => {
      const validKinds: ViewKind[] = ["pendingView", "emptyState", "skeletons", "messages"];
      const cases: ViewParams[] = [
        { hasThread: false, loaded: false, pendingMessage: null,    messagesLength: 0, isRunning: false },
        { hasThread: false, loaded: false, pendingMessage: "hi",    messagesLength: 0, isRunning: true  },
        { hasThread: false, loaded: true,  pendingMessage: null,    messagesLength: 0, isRunning: false },
        { hasThread: false, loaded: true,  pendingMessage: "hi",    messagesLength: 0, isRunning: true  },
        { hasThread: true,  loaded: false, pendingMessage: null,    messagesLength: 0, isRunning: false },
        { hasThread: true,  loaded: false, pendingMessage: "hi",    messagesLength: 0, isRunning: true  },
        { hasThread: true,  loaded: true,  pendingMessage: null,    messagesLength: 0, isRunning: false },
        { hasThread: true,  loaded: true,  pendingMessage: "hi",    messagesLength: 0, isRunning: true  },
        { hasThread: true,  loaded: true,  pendingMessage: null,    messagesLength: 3, isRunning: false },
        { hasThread: true,  loaded: true,  pendingMessage: "hi",    messagesLength: 3, isRunning: true  },
      ];
      for (const c of cases) {
        expect(validKinds).toContain(selectView(c));
      }
    });
  });
});
