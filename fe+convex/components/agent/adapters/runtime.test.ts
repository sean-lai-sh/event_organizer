import { afterEach, describe, expect, test } from "bun:test";

import { createThread, getThreadState, listThreads } from "./runtime";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockJsonResponse(payload: unknown) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

describe("runtime adapter", () => {
  test("maps thread summary into the thread rail preview", async () => {
    mockJsonResponse([
      {
        external_id: "thread_1",
        channel: "web",
        title: "Agent workspace",
        summary: "Meaningful recent assistant context",
        updated_at: 100,
      },
    ]);

    const threads = await listThreads();

    expect(threads).toHaveLength(1);
    expect(threads[0]?.lastMessage).toBe("Meaningful recent assistant context");
  });

  test("createThread forwards context_links so the backend can link to an event", async () => {
    let captured: { url: string; init?: RequestInit } | null = null;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      captured = { url: String(input), init };
      return new Response(
        JSON.stringify({
          external_id: "thread_42",
          channel: "web",
          title: "Room booking · Panel",
          summary: null,
          updated_at: 200,
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const thread = await createThread({
      title: "Room booking · Panel",
      contextLinks: [
        { entityType: "event", entityId: "evt_1", label: "Panel" },
      ],
    });

    expect(thread.id).toBe("thread_42");
    expect(captured).not.toBeNull();
    const body = JSON.parse(String(captured!.init?.body ?? "{}"));
    expect(body.title).toBe("Room booking · Panel");
    expect(body.context_links).toEqual([
      {
        relation: "context",
        entity_type: "event",
        entity_id: "evt_1",
        label: "Panel",
        url: undefined,
        metadata_json: undefined,
      },
    ]);
  });

  test("createThread called with just a title omits context_links", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body ?? "{}"));
      return new Response(
        JSON.stringify({
          external_id: "thread_1",
          channel: "web",
          title: "Plain",
          summary: null,
          updated_at: 1,
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    await createThread("Plain");

    expect(capturedBody).not.toBeNull();
    expect(capturedBody!.title).toBe("Plain");
    expect("context_links" in capturedBody!).toBe(false);
  });

  test("maps checklist artifacts from backend payloads", async () => {
    mockJsonResponse({
      thread: {
        external_id: "thread_1",
        channel: "web",
        title: "Actionable thread",
        summary: "Outreach Status",
        updated_at: 100,
      },
      runs: [],
      messages: [],
      approvals: [],
      artifacts: [
        {
          external_id: "artifact_1",
          thread_external_id: "thread_1",
          kind: "report",
          title: "Response",
          summary: "Outreach Status",
          content_blocks: [{ kind: "text", text: "Full response body" }],
          created_at: 100,
        },
        {
          external_id: "artifact_2",
          thread_external_id: "thread_1",
          kind: "checklist",
          title: "Next Steps",
          summary: "2 action items",
          content_blocks: [
            {
              kind: "checklist_data",
              data_json: JSON.stringify({
                items: [
                  { id: "todo_1", label: "Send the draft to Alex", checked: false },
                  { id: "todo_2", label: "Confirm the speaker availability window", checked: false },
                ],
              }),
            },
          ],
          created_at: 101,
        },
      ],
    });

    const state = await getThreadState("thread_1");

    expect(state.thread.lastMessage).toBe("Outreach Status");
    expect(state.artifacts[0]).toMatchObject({
      type: "report",
      title: "Response",
      data: { summary: "Outreach Status" },
    });
    expect(state.artifacts[1]).toMatchObject({
      type: "checklist",
      title: "Next Steps",
      data: {
        items: [
          { id: "todo_1", label: "Send the draft to Alex", checked: false },
          { id: "todo_2", label: "Confirm the speaker availability window", checked: false },
        ],
      },
    });
  });
});
