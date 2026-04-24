import { afterEach, describe, expect, test } from "bun:test";

import { buildRoomBookingPrompt, launchRoomBookingThread } from "./roomBooking";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

type CapturedRequest = { url: string; init: RequestInit | undefined };

function captureFetchSequence(
  responses: unknown[],
): { requests: CapturedRequest[] } {
  const requests: CapturedRequest[] = [];
  let index = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    requests.push({ url, init });
    const payload = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { requests };
}

describe("buildRoomBookingPrompt", () => {
  test("includes the title and every provided field", () => {
    const prompt = buildRoomBookingPrompt({
      title: "Growth Panel",
      eventType: "Speaker Panel",
      date: "2026-05-15",
      startTime: "6:00 PM",
      endTime: "7:30 PM",
      location: "Leslie eLab",
      description: "Panel on scale-ups",
      targetingNotes: "Founders",
      numAttendees: 30,
    });

    expect(prompt).toContain("Lean/Launchpad");
    expect(prompt).toContain("Growth Panel");
    expect(prompt).toContain("Speaker Panel");
    expect(prompt).toContain("2026-05-15");
    expect(prompt).toContain("6:00 PM");
    expect(prompt).toContain("7:30 PM");
    expect(prompt).toContain("Leslie eLab");
    expect(prompt).toContain("Founders");
    expect(prompt).toContain("30");
    expect(prompt).toContain("find_oncehub_slots");
    expect(prompt).toContain("book_oncehub_room");
  });

  test("gracefully handles missing fields with an Untitled event fallback", () => {
    const prompt = buildRoomBookingPrompt({ title: "" });
    expect(prompt).toContain("Untitled event");
  });
});

describe("launchRoomBookingThread", () => {
  test("creates a thread with an event context link and starts a run", async () => {
    const { requests } = captureFetchSequence([
      { external_id: "thread_7", channel: "web", title: "Room booking · Gala", updated_at: 1 },
      { run: { external_id: "run_1", status: "running", started_at: 0 }, events: [] },
    ]);

    const { threadId } = await launchRoomBookingThread({
      eventId: "evt_42",
      seed: { title: "Gala", date: "2026-05-15" },
    });

    expect(threadId).toBe("thread_7");
    expect(requests).toHaveLength(2);

    const createBody = JSON.parse(requests[0]!.init!.body as string);
    expect(createBody.title).toBe("Room booking · Gala");
    expect(createBody.context_links).toEqual([
      {
        relation: "subject",
        entity_type: "event",
        entity_id: "evt_42",
        label: "Gala",
      },
    ]);

    const runBody = JSON.parse(requests[1]!.init!.body as string);
    expect(runBody.thread_id).toBe("thread_7");
    expect(runBody.input_text).toContain("Gala");
    expect(runBody.input_text).toContain("book_oncehub_room");
  });

  test("omits context links when no eventId is provided", async () => {
    const { requests } = captureFetchSequence([
      { external_id: "thread_8", channel: "web", title: "Room booking · Untitled event", updated_at: 1 },
      { run: { external_id: "run_2", status: "running", started_at: 0 }, events: [] },
    ]);

    await launchRoomBookingThread({
      seed: { title: "" },
    });

    const createBody = JSON.parse(requests[0]!.init!.body as string);
    expect(createBody.context_links).toBeUndefined();
  });
});
