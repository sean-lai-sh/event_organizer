import { describe, expect, it } from "bun:test";
import {
  computeKpis,
  formatEventDate,
  formatStatus,
  toEventRows,
  type RawEvent,
} from "./dashboardView";

const SAMPLE_EVENTS: RawEvent[] = [
  {
    _id: "1",
    title: "AI & Society Speaker Panel",
    event_date: "2026-06-01",
    event_type: "Speaker Panel",
    status: "outreach",
  },
  {
    _id: "2",
    title: "Web3 & Startups Workshop",
    event_date: "2025-03-10",
    event_type: "Workshop",
    status: "completed",
  },
  {
    _id: "3",
    title: "Spring Networking Mixer",
    event_date: "2026-07-15",
    event_type: "Networking",
    status: "outreach",
  },
  {
    _id: "4",
    title: "No-date Event",
    event_date: null,
    event_type: null,
    status: "draft",
  },
];

// ---------------------------------------------------------------------------
// computeKpis
// ---------------------------------------------------------------------------

describe("computeKpis", () => {
  it("returns four KPI rows", () => {
    const kpis = computeKpis(SAMPLE_EVENTS, { today: "2026-05-01" });
    expect(kpis).toHaveLength(4);
  });

  it("counts total events correctly", () => {
    const kpis = computeKpis(SAMPLE_EVENTS, { today: "2026-05-01" });
    const total = kpis.find((k) => k.label === "total events");
    expect(total?.value).toBe("4");
  });

  it("counts active outreach events", () => {
    const kpis = computeKpis(SAMPLE_EVENTS, { today: "2026-05-01" });
    const outreach = kpis.find((k) => k.label === "active outreach");
    expect(outreach?.value).toBe("2");
  });

  it("uses provided speakersConfirmed override", () => {
    const kpis = computeKpis(SAMPLE_EVENTS, { today: "2026-05-01", speakersConfirmed: 7 });
    const speakers = kpis.find((k) => k.label === "speakers confirmed");
    expect(speakers?.value).toBe("7");
  });

  it("defaults speakersConfirmed to 0 when not provided", () => {
    const kpis = computeKpis(SAMPLE_EVENTS, { today: "2026-05-01" });
    const speakers = kpis.find((k) => k.label === "speakers confirmed");
    expect(speakers?.value).toBe("0");
  });

  it("counts upcoming events on or after today", () => {
    // today is 2026-05-01; events on 2026-06-01 and 2026-07-15 qualify; null date does not
    const kpis = computeKpis(SAMPLE_EVENTS, { today: "2026-05-01" });
    const upcoming = kpis.find((k) => k.label === "upcoming");
    expect(upcoming?.value).toBe("2");
  });

  it("counts a same-day event as upcoming", () => {
    const events: RawEvent[] = [
      { _id: "x", title: "Today's event", event_date: "2026-05-01", status: "outreach" },
    ];
    const kpis = computeKpis(events, { today: "2026-05-01" });
    const upcoming = kpis.find((k) => k.label === "upcoming");
    expect(upcoming?.value).toBe("1");
  });

  it("returns 0 upcoming when all events are in the past", () => {
    const events: RawEvent[] = [
      { _id: "x", title: "Old event", event_date: "2023-01-01", status: "completed" },
    ];
    const kpis = computeKpis(events, { today: "2026-05-01" });
    const upcoming = kpis.find((k) => k.label === "upcoming");
    expect(upcoming?.value).toBe("0");
  });

  it("handles an empty events list", () => {
    const kpis = computeKpis([], { today: "2026-05-01" });
    expect(kpis.find((k) => k.label === "total events")?.value).toBe("0");
    expect(kpis.find((k) => k.label === "active outreach")?.value).toBe("0");
    expect(kpis.find((k) => k.label === "upcoming")?.value).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// formatEventDate
// ---------------------------------------------------------------------------

describe("formatEventDate", () => {
  it("returns TBD for null", () => {
    expect(formatEventDate(null)).toBe("TBD");
  });

  it("returns TBD for undefined", () => {
    expect(formatEventDate(undefined)).toBe("TBD");
  });

  it("returns TBD for empty string", () => {
    expect(formatEventDate("")).toBe("TBD");
  });

  it("formats a valid YYYY-MM-DD date string", () => {
    // We only check that the output contains the year to stay locale-agnostic
    const result = formatEventDate("2026-06-01");
    expect(result).toContain("2026");
  });

  it("returns the original string for an invalid date", () => {
    expect(formatEventDate("not-a-date")).toBe("not-a-date");
  });
});

// ---------------------------------------------------------------------------
// formatStatus
// ---------------------------------------------------------------------------

describe("formatStatus", () => {
  it("capitalises the first letter", () => {
    expect(formatStatus("outreach")).toBe("Outreach");
  });

  it("handles already-capitalised input", () => {
    expect(formatStatus("Completed")).toBe("Completed");
  });

  it("returns em dash for null", () => {
    expect(formatStatus(null)).toBe("—");
  });

  it("returns em dash for undefined", () => {
    expect(formatStatus(undefined)).toBe("—");
  });

  it("returns em dash for empty string", () => {
    expect(formatStatus("")).toBe("—");
  });
});

// ---------------------------------------------------------------------------
// toEventRows
// ---------------------------------------------------------------------------

describe("toEventRows", () => {
  it("maps all events when no limit is given", () => {
    const rows = toEventRows(SAMPLE_EVENTS);
    expect(rows).toHaveLength(SAMPLE_EVENTS.length);
  });

  it("respects the limit parameter", () => {
    const rows = toEventRows(SAMPLE_EVENTS, 2);
    expect(rows).toHaveLength(2);
  });

  it("preserves _id and title", () => {
    const rows = toEventRows(SAMPLE_EVENTS);
    expect(rows[0]._id).toBe("1");
    expect(rows[0].title).toBe("AI & Society Speaker Panel");
  });

  it("formats status using formatStatus", () => {
    const rows = toEventRows(SAMPLE_EVENTS);
    expect(rows[0].status).toBe("Outreach");
  });

  it("falls back to em dash for missing type", () => {
    const rows = toEventRows(SAMPLE_EVENTS);
    const noTypeRow = rows.find((r) => r._id === "4");
    expect(noTypeRow?.type).toBe("—");
  });

  it("stores empty string for missing event_date", () => {
    const rows = toEventRows(SAMPLE_EVENTS);
    const noDateRow = rows.find((r) => r._id === "4");
    expect(noDateRow?.event_date).toBe("");
  });

  it("returns an empty array for empty input", () => {
    expect(toEventRows([])).toHaveLength(0);
  });
});
