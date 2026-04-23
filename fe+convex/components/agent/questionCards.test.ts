import { describe, expect, test } from "bun:test";

import {
  serializeChoiceRequestSubmission,
  serializeFormRequestSubmission,
} from "./questionCards";

describe("question card submissions", () => {
  test("serializes form answers into deterministic run text", () => {
    const text = serializeFormRequestSubmission(
      {
        requestId: "req_123",
        entity: "event",
        mode: "create",
        title: "Create event",
        fields: [
          { key: "title", label: "Title", inputType: "text", required: true },
          { key: "event_date", label: "Date", inputType: "date", required: true },
          { key: "needs_outreach", label: "Needs outreach", inputType: "checkbox" },
        ],
      },
      {
        title: "AI & Society",
        event_date: "2026-05-22",
        needs_outreach: true,
      }
    );

    expect(text).toBe(
      [
        "[agent-form-response]",
        "entity: event",
        "mode: create",
        "request_id: req_123",
        "title: AI & Society",
        "event_date: 2026-05-22",
        "needs_outreach: true",
        "[/agent-form-response]",
      ].join("\n")
    );
  });

  test("serializes choice answers into deterministic run text", () => {
    const text = serializeChoiceRequestSubmission(
      {
        requestId: "req_456",
        entity: "event",
        mode: "update",
        question: "Which event?",
        choices: [{ id: "events:123", label: "VC Panel" }],
      },
      "events:123"
    );

    expect(text).toContain("request_id: req_456");
    expect(text).toContain("choice_id: events:123");
    expect(text).toContain("choice_label: VC Panel");
  });
});
