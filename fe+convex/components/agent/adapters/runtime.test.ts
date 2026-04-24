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

type CapturedRequest = { url: string; init: RequestInit | undefined };

function captureFetch(payload: unknown): { requests: CapturedRequest[] } {
  const requests: CapturedRequest[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    requests.push({ url, init });
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { requests };
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

  test("createThread accepts a bare title string for backward compatibility", async () => {
    const { requests } = captureFetch({
      external_id: "thread_1",
      channel: "web",
      title: "My thread",
      updated_at: 100,
    });

    await createThread("My thread");

    const body = JSON.parse(requests[0]?.init?.body as string);
    expect(body).toEqual({ channel: "web", title: "My thread" });
  });

  test("createThread forwards context links when provided", async () => {
    const { requests } = captureFetch({
      external_id: "thread_2",
      channel: "web",
      title: "Room booking · Winter Gala",
      updated_at: 101,
    });

    await createThread({
      title: "Room booking · Winter Gala",
      contextLinks: [
        { entityType: "event", entityId: "evt_99", label: "Winter Gala" },
      ],
    });

    const body = JSON.parse(requests[0]?.init?.body as string);
    expect(body.title).toBe("Room booking · Winter Gala");
    expect(body.context_links).toEqual([
      {
        relation: "subject",
        entity_type: "event",
        entity_id: "evt_99",
        label: "Winter Gala",
      },
    ]);
  });
});
