import { describe, expect, test } from "bun:test";

import {
  buildOutreachThreadHref,
  formatInboundStateLabel,
  matchesThreadSearch,
  selectVisibleThreads,
  toInboxRowModel,
  type OutreachInboxThread,
} from "./communicationsView";

const FIXTURE_THREADS: OutreachInboxThread[] = [
  {
    _id: "event_outreach:1",
    attio_record_id: "person_1",
    attio_speakers_entry_id: "speaker_1",
    inbound_state: "needs_review",
    inbound_state_label: "Needs Review",
    event_name: "AI & Society Panel",
    contact_name: "Sarah Chen",
    contact_email: "sarah@example.com",
    contact_identifier: "Sarah Chen",
    message_count: 3,
    last_activity_at: 300,
  },
  {
    _id: "event_outreach:2",
    attio_record_id: "person_2",
    inbound_state: "awaiting_member_reply",
    inbound_state_label: "Awaiting Reply",
    event_name: "Web3 Workshop",
    contact_name: null,
    contact_email: "james@example.com",
    contact_identifier: "james@example.com",
    message_count: 2,
    last_activity_at: 200,
  },
  {
    _id: "event_outreach:3",
    attio_record_id: "person_3",
    inbound_state: "resolved",
    inbound_state_label: "Resolved",
    event_name: "Networking Mixer",
    contact_name: null,
    contact_email: null,
    contact_identifier: "person_3",
    message_count: 1,
    last_activity_at: 100,
  },
];

describe("communications view helpers", () => {
  test("filter tabs toggle visible rows by inbound_state", () => {
    expect(selectVisibleThreads(FIXTURE_THREADS, "all", "")).toHaveLength(3);
    expect(selectVisibleThreads(FIXTURE_THREADS, "needs_review", "")).toHaveLength(1);
    expect(selectVisibleThreads(FIXTURE_THREADS, "awaiting_member_reply", "")).toHaveLength(1);
    expect(selectVisibleThreads(FIXTURE_THREADS, "resolved", "")).toHaveLength(1);
  });

  test("search narrows rows by contact name and email", () => {
    expect(selectVisibleThreads(FIXTURE_THREADS, "all", "sarah")).toHaveLength(1);
    expect(selectVisibleThreads(FIXTURE_THREADS, "all", "james@example.com")).toHaveLength(1);
  });

  test("search narrows rows by event name", () => {
    const visible = selectVisibleThreads(FIXTURE_THREADS, "all", "networking");
    expect(visible).toHaveLength(1);
    expect(visible[0].event_name).toBe("Networking Mixer");
  });

  test("falls back to attio_record_id when contact fields are missing", () => {
    const row = toInboxRowModel(FIXTURE_THREADS[2]);
    expect(row.contactLine).toBe("person_3");
  });

  test("View thread routes to the detail surface", () => {
    expect(buildOutreachThreadHref("event_outreach:2")).toBe(
      "/dashboard/communications/event_outreach:2"
    );
    expect(toInboxRowModel(FIXTURE_THREADS[1]).href).toBe(
      "/dashboard/communications/event_outreach:2"
    );
  });
});

describe("communications integration fixtures", () => {
  test("fixture rows expose the correct badge labels and counts for each filter", () => {
    const allRows = selectVisibleThreads(FIXTURE_THREADS, "all", "").map(toInboxRowModel);
    expect(allRows).toHaveLength(3);
    expect(allRows.map((row) => row.statusLabel)).toEqual([
      "Needs Review",
      "Awaiting Reply",
      "Resolved",
    ]);

    const needsReview = selectVisibleThreads(FIXTURE_THREADS, "needs_review", "").map(toInboxRowModel);
    expect(needsReview).toHaveLength(1);
    expect(needsReview[0].statusLabel).toBe(formatInboundStateLabel("needs_review"));

    const awaiting = selectVisibleThreads(
      FIXTURE_THREADS,
      "awaiting_member_reply",
      ""
    ).map(toInboxRowModel);
    expect(awaiting).toHaveLength(1);
    expect(awaiting[0].statusLabel).toBe("Awaiting Reply");

    const resolved = selectVisibleThreads(FIXTURE_THREADS, "resolved", "").map(toInboxRowModel);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].statusLabel).toBe("Resolved");
  });

  test("matchesThreadSearch checks the same fields shown in the inbox", () => {
    expect(matchesThreadSearch(FIXTURE_THREADS[0], "AI & Society")).toBe(true);
    expect(matchesThreadSearch(FIXTURE_THREADS[1], "james@example.com")).toBe(true);
    expect(matchesThreadSearch(FIXTURE_THREADS[2], "person_3")).toBe(true);
    expect(matchesThreadSearch(FIXTURE_THREADS[2], "missing")).toBe(false);
  });
});
