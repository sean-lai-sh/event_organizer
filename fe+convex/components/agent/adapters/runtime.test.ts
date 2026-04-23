import { describe, expect, test } from "bun:test";

import { mapContentBlock } from "./runtime";

describe("runtime content block mapping", () => {
  test("maps persisted form_request blocks", () => {
    const block = mapContentBlock({
      kind: "form_request",
      label: "event",
      mime_type: "application/json",
      data_json: JSON.stringify({
        request_id: "req_123",
        entity: "event",
        mode: "create",
        title: "Create event",
        submit_label: "Continue",
        fields: [
          {
            key: "title",
            label: "Event title",
            input_type: "text",
            required: true,
          },
        ],
      }),
    });

    expect(block.type).toBe("form_request");
    if (block.type !== "form_request") return;
    expect(block.payload.requestId).toBe("req_123");
    expect(block.payload.fields[0]).toMatchObject({
      key: "title",
      inputType: "text",
      required: true,
    });
  });

  test("maps persisted choice_request blocks", () => {
    const block = mapContentBlock({
      kind: "choice_request",
      label: "event",
      mime_type: "application/json",
      data_json: JSON.stringify({
        request_id: "req_456",
        entity: "event",
        mode: "update",
        question: "Which event should I update?",
        choices: [{ id: "events:123", label: "VC Panel", description: "May 1" }],
      }),
    });

    expect(block.type).toBe("choice_request");
    if (block.type !== "choice_request") return;
    expect(block.payload.requestId).toBe("req_456");
    expect(block.payload.choices[0]).toEqual({
      id: "events:123",
      label: "VC Panel",
      description: "May 1",
    });
  });
});
