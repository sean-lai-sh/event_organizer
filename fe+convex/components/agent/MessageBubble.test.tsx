import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { AgentMessage } from "./types";

mock.module("lucide-react", () => ({
  Wrench: () => null,
}));

describe("MessageBubble question cards", () => {
  test("renders persisted form request card content", async () => {
    const { MessageBubble } = await import("./MessageBubble");
    const message: AgentMessage = {
      id: "msg_1",
      threadId: "thread_1",
      role: "assistant",
      createdAt: 1,
      content: [
        {
          type: "form_request",
          payload: {
            requestId: "req_123",
            entity: "event",
            mode: "create",
            title: "Create event",
            fields: [
              { key: "title", label: "Event title", inputType: "text", required: true },
            ],
          },
        },
      ],
    };

    const markup = renderToStaticMarkup(<MessageBubble message={message} />);
    expect(markup).toContain("Create event");
    expect(markup).toContain("Event title");
  });
});
