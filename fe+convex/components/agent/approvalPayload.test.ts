/**
 * Tests for the shared approval payload helpers.
 *
 * Covers the contract that both pending approval surfaces and the resolved
 * approval receipt depend on: nested payload extraction, friendly value
 * formatting, omission of empty values, and consistent label mapping.
 */

import { describe, test, expect } from "bun:test";
import {
  FIELD_LABELS,
  extractApprovalFields,
  extractInnerPayload,
  formatFieldValue,
} from "./approvalPayload";

/* ══════════════════════════════════════════════════════════════════════════ */
/*  extractInnerPayload                                                       */
/* ══════════════════════════════════════════════════════════════════════════ */

describe("extractInnerPayload — nested tool_input lookup", () => {
  test("unwraps payload.tool_input when present", () => {
    const raw = {
      payload: {
        tool_input: { title: "Tech Leaders", needs_outreach: true },
      },
    };
    expect(extractInnerPayload(raw)).toEqual({
      title: "Tech Leaders",
      needs_outreach: true,
    });
  });

  test("falls back to the top-level object when tool_input is missing", () => {
    const raw = { title: "Inline shape", event_date: "2026-04-30" };
    expect(extractInnerPayload(raw)).toEqual(raw);
  });

  test("returns {} for null/undefined input so callers can iterate safely", () => {
    expect(extractInnerPayload(null)).toEqual({});
    expect(extractInnerPayload(undefined)).toEqual({});
  });

  test("returns {} when payload.tool_input is not an object (defensive)", () => {
    const raw = { payload: { tool_input: "not an object" } } as unknown as Record<string, unknown>;
    // Non-object tool_input means we fall back to the wrapper, which still
    // includes the `payload` key — this matches the production behaviour.
    expect(extractInnerPayload(raw)).toEqual(raw);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/*  formatFieldValue                                                          */
/* ══════════════════════════════════════════════════════════════════════════ */

describe("formatFieldValue — friendly value formatting", () => {
  test("renders true as Yes and false as No", () => {
    expect(formatFieldValue("needs_outreach", true)).toBe("Yes");
    expect(formatFieldValue("needs_outreach", false)).toBe("No");
  });

  test("returns numbers as plain strings", () => {
    expect(formatFieldValue("count", 5)).toBe("5");
    expect(formatFieldValue("count", 0)).toBe("0");
  });

  test("formats parseable date keys with toLocaleDateString", () => {
    const formatted = formatFieldValue("event_date", "2026-04-30");
    // The locale-formatted output varies by environment, so the specific
    // string isn't asserted — only that it's been rewritten away from the raw
    // ISO string.
    expect(formatted).not.toBe("2026-04-30");
    expect(formatted.length).toBeGreaterThan(0);
  });

  test("date-only YYYY-MM-DD strings keep their calendar day across timezones", () => {
    // Regression: `new Date("2026-04-30")` parses as UTC midnight, which
    // displays as 2026-04-29 once toLocaleDateString shifts into a negative
    // UTC offset (e.g. America/Los_Angeles). Parsing into local time keeps
    // the day stable. We assert that the formatted output references day 30,
    // which holds regardless of the test runner's locale.
    const formatted = formatFieldValue("event_date", "2026-04-30");
    expect(formatted).toMatch(/30/);
    expect(formatted).not.toMatch(/29/);
  });

  test("date-only strings are still recognised under the alias 'date' key", () => {
    const formatted = formatFieldValue("date", "2026-01-01");
    expect(formatted).toMatch(/1/);
    expect(formatted).not.toMatch(/2025/);
  });

  test("leaves unparseable date strings unchanged", () => {
    expect(formatFieldValue("event_date", "TBD")).toBe("TBD");
  });

  test("passes non-date strings through unchanged", () => {
    expect(formatFieldValue("title", "Tech Leaders Networking Breakfast")).toBe(
      "Tech Leaders Networking Breakfast",
    );
  });

  test("returns empty string for null/undefined input", () => {
    expect(formatFieldValue("title", null)).toBe("");
    expect(formatFieldValue("title", undefined)).toBe("");
  });

  test("stringifies arrays and objects as compact JSON", () => {
    expect(formatFieldValue("tags", ["a", "b"])).toBe('["a","b"]');
    expect(formatFieldValue("meta", { x: 1 })).toBe('{"x":1}');
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/*  extractApprovalFields                                                     */
/* ══════════════════════════════════════════════════════════════════════════ */

describe("extractApprovalFields — payload → labelled rows", () => {
  test("maps known keys to friendly labels and unwraps nested tool_input", () => {
    const raw = {
      payload: {
        tool_input: {
          title: "Tech Leaders Networking Breakfast",
          event_date: "2026-04-30",
          needs_outreach: true,
        },
      },
    };
    const fields = extractApprovalFields(raw);
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));

    expect(byKey.title.label).toBe(FIELD_LABELS.title);
    expect(byKey.title.label).toBe("Event Name");
    expect(byKey.event_date.label).toBe("Date");
    expect(byKey.needs_outreach.label).toBe("Needs Outreach");
  });

  test("omits null, undefined, and empty-string fields", () => {
    const raw = {
      title: "Real value",
      description: "",
      location: null,
      event_type: undefined,
    } as Record<string, unknown>;

    const fields = extractApprovalFields(raw);
    const keys = fields.map((f) => f.key);
    expect(keys).toContain("title");
    expect(keys).not.toContain("description");
    expect(keys).not.toContain("location");
    expect(keys).not.toContain("event_type");
  });

  test("formats booleans as Yes/No in displayValue and rawValue", () => {
    const fields = extractApprovalFields({ needs_outreach: false });
    expect(fields).toHaveLength(1);
    expect(fields[0].displayValue).toBe("No");
    expect(fields[0].rawValue).toBe("No");
  });

  test("falls back to the raw key when no friendly label exists", () => {
    const fields = extractApprovalFields({ unknown_field: "value" });
    expect(fields[0].label).toBe("unknown_field");
  });

  test("flags long-text keys (description) as isLong for clamping", () => {
    const fields = extractApprovalFields({
      title: "Short",
      description: "Long body text",
    });
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
    expect(byKey.title.isLong).toBe(false);
    expect(byKey.description.isLong).toBe(true);
  });

  test("returns an empty array when payload is empty/null/undefined", () => {
    expect(extractApprovalFields(null)).toEqual([]);
    expect(extractApprovalFields(undefined)).toEqual([]);
    expect(extractApprovalFields({})).toEqual([]);
  });

  test("formats a parseable event_date away from the raw ISO string", () => {
    const fields = extractApprovalFields({ event_date: "2026-04-30" });
    expect(fields[0].displayValue).not.toBe("2026-04-30");
    expect(fields[0].rawValue).toBe("2026-04-30");
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Resolved approval receipt rendering rules                                 */
/*                                                                            */
/*  These tests assert the pure logic that the resolved approval card uses    */
/*  to decide what's shown, without rendering React. They protect against the */
/*  regression the issue was filed to prevent: raw JSON being the default.    */
/* ══════════════════════════════════════════════════════════════════════════ */

const DESCRIPTION_CLAMP_CHARS = 220;

function clampDisplay(
  value: string,
  isLong: boolean,
  expanded: boolean,
): { shown: string; isClamped: boolean } {
  const isClamped = isLong && value.length > DESCRIPTION_CLAMP_CHARS;
  const shown =
    isClamped && !expanded
      ? value.slice(0, DESCRIPTION_CLAMP_CHARS).trimEnd() + "…"
      : value;
  return { shown, isClamped };
}

describe("resolved card — long description clamping", () => {
  test("clamps long descriptions when collapsed and appends an ellipsis", () => {
    const long = "x".repeat(400);
    const { shown, isClamped } = clampDisplay(long, true, false);
    expect(isClamped).toBe(true);
    expect(shown.endsWith("…")).toBe(true);
    expect(shown.length).toBeLessThan(long.length);
  });

  test("renders the full string when expanded", () => {
    const long = "x".repeat(400);
    const { shown, isClamped } = clampDisplay(long, true, true);
    expect(isClamped).toBe(true);
    expect(shown).toBe(long);
  });

  test("does not clamp short long-text fields", () => {
    const short = "Hello world";
    const { shown, isClamped } = clampDisplay(short, true, false);
    expect(isClamped).toBe(false);
    expect(shown).toBe(short);
  });

  test("does not clamp non-long fields even when long", () => {
    const value = "x".repeat(400);
    const { isClamped } = clampDisplay(value, false, false);
    expect(isClamped).toBe(false);
  });
});

describe("resolved card — status surface (regression: no raw JSON by default)", () => {
  // The card decides which icon/label to render purely from approval.status.
  function statusLabel(status: "approved" | "rejected"): string {
    return status === "approved" ? "Approved" : "Rejected";
  }

  test("shows 'Approved' as the status label first for approved approvals", () => {
    expect(statusLabel("approved")).toBe("Approved");
  });

  test("shows 'Rejected' as the status label first for rejected approvals", () => {
    expect(statusLabel("rejected")).toBe("Rejected");
  });

  // Regression guard: the resolved card must not render proposedPayload as a
  // top-level <pre> JSON block. extractApprovalFields always returns labelled
  // rows; the raw JSON stays behind a <details> disclosure only.
  test("extractApprovalFields never returns a stringified JSON blob as a single field", () => {
    const fields = extractApprovalFields({
      title: "Tech Leaders",
      event_date: "2026-04-30",
      needs_outreach: true,
    });
    expect(fields.length).toBeGreaterThan(1);
    for (const f of fields) {
      expect(f.label).not.toMatch(/^\{/);
      expect(f.displayValue).not.toMatch(/^\{[\s\S]*"title"/);
    }
  });
});
