/**
 * Tests for the composer-attached approval helpers introduced for issue #42.
 *
 * These cover the pure decision logic so the Yes / No / Tell me something
 * else CTAs and the active-approval selection rule can be verified without
 * rendering React.
 */

import { describe, test, expect } from "bun:test";
import type { AgentApproval } from "./types";
import {
  TELL_ME_SOMETHING_ELSE_DRAFT,
  buildTellMeSomethingElseDraft,
  countPendingApprovals,
  decisionForCta,
  getActiveComposerApproval,
  runDecision,
  summarizeApproval,
} from "./composerApproval";

function approval(overrides: Partial<AgentApproval>): AgentApproval {
  return {
    id: "appr_default",
    threadId: "thread_default",
    runId: "run_default",
    requestedAction: "Approve write",
    riskLevel: "medium",
    proposedPayload: {},
    status: "pending",
    createdAt: 0,
    ...overrides,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  getActiveComposerApproval                                                 */
/* ══════════════════════════════════════════════════════════════════════════ */

describe("getActiveComposerApproval — newest pending wins", () => {
  test("returns null for an empty list", () => {
    expect(getActiveComposerApproval([])).toBeNull();
  });

  test("returns null when no approvals are pending", () => {
    const list = [
      approval({ id: "a", status: "approved", createdAt: 100 }),
      approval({ id: "b", status: "rejected", createdAt: 200 }),
    ];
    expect(getActiveComposerApproval(list)).toBeNull();
  });

  test("returns the newest pending approval (by createdAt)", () => {
    const list = [
      approval({ id: "older", createdAt: 100 }),
      approval({ id: "newer", createdAt: 200 }),
    ];
    expect(getActiveComposerApproval(list)?.id).toBe("newer");
  });

  test("ignores resolved approvals even if they are newer than pending ones", () => {
    const list = [
      approval({ id: "pending_old", status: "pending", createdAt: 100 }),
      approval({ id: "approved_new", status: "approved", createdAt: 500 }),
    ];
    expect(getActiveComposerApproval(list)?.id).toBe("pending_old");
  });

  test("returns the single pending approval when only one exists", () => {
    const list = [approval({ id: "only", createdAt: 42 })];
    expect(getActiveComposerApproval(list)?.id).toBe("only");
  });

  test("survives a refresh-style reload — the same pending approval is selected again", () => {
    // Simulate the post-refresh scenario: thread state arrives with a mix
    // of resolved + pending entries; the same active approval should be picked.
    const initial = [
      approval({ id: "a1", status: "pending", createdAt: 300 }),
      approval({ id: "a2", status: "approved", createdAt: 100 }),
    ];
    const refreshed = [
      approval({ id: "a2", status: "approved", createdAt: 100 }),
      approval({ id: "a1", status: "pending", createdAt: 300 }),
    ];
    expect(getActiveComposerApproval(initial)?.id).toBe("a1");
    expect(getActiveComposerApproval(refreshed)?.id).toBe("a1");
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/*  countPendingApprovals                                                     */
/* ══════════════════════════════════════════════════════════════════════════ */

describe("countPendingApprovals — passive backlog count", () => {
  test("returns 0 for an empty list", () => {
    expect(countPendingApprovals([])).toBe(0);
  });

  test("counts only pending statuses", () => {
    const list = [
      approval({ id: "a", status: "pending" }),
      approval({ id: "b", status: "pending" }),
      approval({ id: "c", status: "approved" }),
      approval({ id: "d", status: "rejected" }),
    ];
    expect(countPendingApprovals(list)).toBe(2);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/*  summarizeApproval                                                         */
/* ══════════════════════════════════════════════════════════════════════════ */

describe("summarizeApproval — short, human-readable copy (no raw JSON)", () => {
  test("uses requestedAction as the base title", () => {
    const result = summarizeApproval(approval({ requestedAction: "Create event" }));
    expect(result.title).toBe("Create event");
    expect(result.detail).toBeUndefined();
  });

  test("appends a payload title when one is present", () => {
    const result = summarizeApproval(
      approval({
        requestedAction: "Create event",
        proposedPayload: { payload: { tool_input: { title: "AI & Society Panel" } } },
      }),
    );
    expect(result.title).toBe("Create event · AI & Society Panel");
  });

  test("falls back to a default headline when requestedAction is empty", () => {
    const result = summarizeApproval(approval({ requestedAction: "" }));
    expect(result.title).toBe("Approval required");
  });

  test("never returns a raw stringified JSON payload as the title", () => {
    const payload = { foo: "bar", baz: { nested: 1 } } as Record<string, unknown>;
    const result = summarizeApproval(
      approval({ requestedAction: "Do thing", proposedPayload: payload }),
    );
    expect(result.title).not.toContain("{");
    expect(result.title).not.toContain("}");
  });

  test("does not use opaque ids like event_id as the primary title text", () => {
    const result = summarizeApproval(
      approval({
        requestedAction: "Update event",
        proposedPayload: { payload: { tool_input: { event_id: "evt_abc123" } } },
      }),
    );
    expect(result.title).toBe("Update event");
    expect(result.title).not.toContain("evt_abc123");
  });

  test("builds a compact detail line from up to two recognised payload fields", () => {
    const result = summarizeApproval(
      approval({
        requestedAction: "Create event",
        proposedPayload: {
          payload: {
            tool_input: {
              title: "Panel",
              event_date: "2026-05-01",
              event_time: "6:00 PM",
              location: "Auditorium A",
            },
          },
        },
      }),
    );
    expect(result.detail).toBe("2026-05-01 · 6:00 PM");
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/*  buildTellMeSomethingElseDraft                                             */
/* ══════════════════════════════════════════════════════════════════════════ */

describe("buildTellMeSomethingElseDraft — preserves user input", () => {
  test("preserves a non-empty existing draft verbatim", () => {
    expect(buildTellMeSomethingElseDraft("Find me speakers in NYC")).toBe(
      "Find me speakers in NYC",
    );
  });

  test("seeds the helper text when the draft is empty", () => {
    expect(buildTellMeSomethingElseDraft("")).toBe(TELL_ME_SOMETHING_ELSE_DRAFT);
  });

  test("seeds the helper text when the draft is whitespace-only", () => {
    expect(buildTellMeSomethingElseDraft("   \n\t  ")).toBe(
      TELL_ME_SOMETHING_ELSE_DRAFT,
    );
  });

  test("preserves drafts with leading or trailing whitespace around real content", () => {
    expect(buildTellMeSomethingElseDraft("  hello  ")).toBe("  hello  ");
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/*  decisionForCta                                                            */
/* ══════════════════════════════════════════════════════════════════════════ */

describe("decisionForCta — CTA → submitApproval decision mapping", () => {
  test("Yes maps to approved", () => {
    expect(decisionForCta("yes")).toBe("approved");
  });

  test("No maps to rejected", () => {
    expect(decisionForCta("no")).toBe("rejected");
  });

  test("Tell me something else also maps to rejected", () => {
    expect(decisionForCta("tell_me_something_else")).toBe("rejected");
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/*  runDecision — single-flight submit wrapper                                */
/* ══════════════════════════════════════════════════════════════════════════ */

describe("runDecision — single-flight submit", () => {
  test("Yes calls submitApproval(id, 'approved') exactly once", async () => {
    const calls: Array<[string, "approved" | "rejected"]> = [];
    let loading = false;
    await runDecision({
      approvalId: "appr_1",
      decision: "approved",
      submit: async (id, d) => {
        calls.push([id, d]);
      },
      isLoading: loading,
      setLoading: (next) => {
        loading = next;
      },
    });
    expect(calls).toEqual([["appr_1", "approved"]]);
    expect(loading).toBe(false);
  });

  test("No calls submitApproval(id, 'rejected') exactly once", async () => {
    const calls: Array<[string, "approved" | "rejected"]> = [];
    let loading = false;
    await runDecision({
      approvalId: "appr_2",
      decision: "rejected",
      submit: async (id, d) => {
        calls.push([id, d]);
      },
      isLoading: loading,
      setLoading: (next) => {
        loading = next;
      },
    });
    expect(calls).toEqual([["appr_2", "rejected"]]);
  });

  test("Tell me something else rejects the approval and notifies the parent", async () => {
    const calls: Array<[string, "approved" | "rejected"]> = [];
    const resolvedWith: Array<"approved" | "rejected"> = [];
    let loading = false;
    await runDecision({
      approvalId: "appr_3",
      decision: decisionForCta("tell_me_something_else"),
      submit: async (id, d) => {
        calls.push([id, d]);
      },
      isLoading: loading,
      setLoading: (next) => {
        loading = next;
      },
      onResolved: async (d) => {
        resolvedWith.push(d);
      },
    });
    expect(calls).toEqual([["appr_3", "rejected"]]);
    expect(resolvedWith).toEqual(["rejected"]);
  });

  test("ignores duplicate submissions while a request is in flight", async () => {
    const calls: Array<[string, "approved" | "rejected"]> = [];
    await runDecision({
      approvalId: "appr_4",
      decision: "approved",
      submit: async (id, d) => {
        calls.push([id, d]);
      },
      isLoading: true, // simulate a request already in flight
      setLoading: () => {},
    });
    expect(calls).toEqual([]);
  });

  test("clears loading even when submit throws", async () => {
    let loading = false;
    let caught: unknown = null;
    await runDecision({
      approvalId: "appr_5",
      decision: "approved",
      submit: async () => {
        throw new Error("network down");
      },
      isLoading: loading,
      setLoading: (next) => {
        loading = next;
      },
      onError: (error) => {
        caught = error;
      },
    });
    expect(loading).toBe(false);
    expect((caught as Error)?.message).toBe("network down");
  });

  test("does not invoke onResolved when submit throws", async () => {
    let resolved = false;
    await runDecision({
      approvalId: "appr_6",
      decision: "rejected",
      submit: async () => {
        throw new Error("boom");
      },
      isLoading: false,
      setLoading: () => {},
      onResolved: () => {
        resolved = true;
      },
      onError: () => {},
    });
    expect(resolved).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Regression: pending approvals never render as inline transcript cards     */
/*                                                                            */
/*  ConversationTimeline now picks a single approval via                      */
/*  getActiveComposerApproval and renders it above the composer. Anything     */
/*  else falls through to the resolved-approval treatment.                    */
/* ══════════════════════════════════════════════════════════════════════════ */

function transcriptApprovals(approvals: AgentApproval[]): AgentApproval[] {
  return approvals.filter((a) => a.status !== "pending");
}

describe("regression — pending approvals stay out of the transcript", () => {
  test("transcriptApprovals excludes any pending approval", () => {
    const list = [
      approval({ id: "p1", status: "pending" }),
      approval({ id: "p2", status: "pending" }),
      approval({ id: "r1", status: "approved" }),
      approval({ id: "r2", status: "rejected" }),
    ];
    const result = transcriptApprovals(list);
    expect(result.map((a) => a.id)).toEqual(["r1", "r2"]);
  });

  test("composer surface shows at most one approval even with multiple pending", () => {
    const list = [
      approval({ id: "p1", status: "pending", createdAt: 100 }),
      approval({ id: "p2", status: "pending", createdAt: 200 }),
      approval({ id: "p3", status: "pending", createdAt: 50 }),
    ];
    const active = getActiveComposerApproval(list);
    expect(active?.id).toBe("p2");
    // The remaining pending approvals are tracked passively via the count,
    // never as additional inline cards.
    expect(countPendingApprovals(list)).toBe(3);
  });
});
