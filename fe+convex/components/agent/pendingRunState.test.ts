/**
 * Tests for the pending-run handoff store.
 *
 * This module bridges the gap between the old ConversationTimeline (on /agent,
 * no thread) that creates the thread and the new ConversationTimeline (on
 * /agent/<id>) that needs to show the optimistic UI and call startRun.
 */

import { beforeEach, describe, expect, test } from "bun:test";

// Import fresh module state via dynamic re-import in each test by manually
// resetting between tests instead.  Since the module is stateful we import
// once and rely on the reset behaviour of consumePendingRun.
import { setPendingRun, consumePendingRun } from "./pendingRunState";

// Always clean up so tests are isolated: consume any leftover pending run.
beforeEach(() => {
  consumePendingRun("__reset__");
});

describe("setPendingRun / consumePendingRun", () => {
  test("returns the stored message for the correct threadId", () => {
    setPendingRun("thread_abc", "Hello agent");
    expect(consumePendingRun("thread_abc")).toBe("Hello agent");
  });

  test("returns null for a different threadId", () => {
    setPendingRun("thread_abc", "Hello agent");
    expect(consumePendingRun("thread_xyz")).toBeNull();
  });

  test("is consumed on first read — second call returns null (no duplicate runs)", () => {
    setPendingRun("thread_abc", "Hello agent");
    consumePendingRun("thread_abc");
    expect(consumePendingRun("thread_abc")).toBeNull();
  });

  test("returns null when nothing has been stored", () => {
    expect(consumePendingRun("thread_abc")).toBeNull();
  });

  test("overwrites a previous pending run (user creates two threads in rapid succession)", () => {
    setPendingRun("thread_old", "First message");
    setPendingRun("thread_new", "Second message");
    expect(consumePendingRun("thread_old")).toBeNull();
    expect(consumePendingRun("thread_new")).toBe("Second message");
  });

  test("consuming with wrong id leaves the pending run intact for the correct id", () => {
    setPendingRun("thread_abc", "Hello");
    consumePendingRun("thread_other"); // miss
    expect(consumePendingRun("thread_abc")).toBe("Hello"); // still there
  });
});
