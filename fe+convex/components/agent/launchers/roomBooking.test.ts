import { afterEach, describe, expect, test } from "bun:test";

import { buildRoomBookingPrompt, launchRoomBookingThread } from "./roomBooking";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("roomBooking launcher", () => {
  test("buildRoomBookingPrompt includes the filled-out form details", () => {
    const prompt = buildRoomBookingPrompt({
      title: "AI & Society Panel",
      eventType: "Speaker Panel",
      date: "2026-05-04",
      startTime: "10:00 AM",
      endTime: "11:30 AM",
      location: "Leslie eLab",
      description: "Opening kickoff for the club",
      targetingNotes: "Founders and CS students",
    });

    expect(prompt).toContain("Leslie eLab Lean/Launchpad room via OnceHub");
    expect(prompt).toContain("Title: AI & Society Panel");
    expect(prompt).toContain("Type: Speaker Panel");
    expect(prompt).toContain("When: 2026-05-04 10:00 AM – 11:30 AM");
    expect(prompt).toContain("Targeting notes: Founders and CS students");
    expect(prompt).toContain("find_oncehub_slots");
    expect(prompt).toContain("book_oncehub_room");
  });

  test("buildRoomBookingPrompt degrades gracefully when nothing is filled in", () => {
    const prompt = buildRoomBookingPrompt({});
    expect(prompt).toContain("find_oncehub_slots");
    expect(prompt).not.toContain("Event details:");
  });

  test("launchRoomBookingThread creates a linked thread and starts a run", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url, body });
      if (url.endsWith("/api/agent/threads")) {
        return new Response(
          JSON.stringify({
            external_id: "thread_new_1",
            channel: "web",
            title: body?.title ?? "",
            summary: null,
            updated_at: 1,
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.endsWith("/api/agent/runs")) {
        return new Response(
          JSON.stringify({
            run: { external_id: "run_1", thread_external_id: "thread_new_1", status: "completed", started_at: 1 },
            events: [],
            traces: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch;

    const { threadId } = await launchRoomBookingThread({
      eventId: "evt_abc",
      form: { title: "Startup Panel", date: "2026-05-04" },
      threadTitleFallback: "Startup Panel",
    });

    expect(threadId).toBe("thread_new_1");
    expect(calls).toHaveLength(2);

    const threadCall = calls[0]!;
    expect(threadCall.url.endsWith("/threads")).toBe(true);
    expect(threadCall.body).toMatchObject({
      title: "Room booking · Startup Panel",
      context_links: [
        {
          relation: "context",
          entity_type: "event",
          entity_id: "evt_abc",
          label: "Startup Panel",
        },
      ],
    });

    const runCall = calls[1]!;
    expect(runCall.url.endsWith("/runs")).toBe(true);
    expect((runCall.body as { thread_id: string }).thread_id).toBe("thread_new_1");
    expect((runCall.body as { input_text: string }).input_text).toContain(
      "Leslie eLab Lean/Launchpad room via OnceHub"
    );
  });

  test("launchRoomBookingThread omits context_links when no eventId is provided", async () => {
    let threadBody: Record<string, unknown> | null = null;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/agent/threads")) {
        threadBody = init?.body ? JSON.parse(String(init.body)) : null;
        return new Response(
          JSON.stringify({
            external_id: "thread_new_2",
            channel: "web",
            title: "",
            summary: null,
            updated_at: 1,
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          run: { external_id: "run_1", thread_external_id: "thread_new_2", status: "completed", started_at: 1 },
          events: [],
          traces: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    await launchRoomBookingThread({
      form: { title: "Plain" },
    });

    expect(threadBody).not.toBeNull();
    expect("context_links" in threadBody!).toBe(false);
  });
});
