import { createThread, startRun } from "../adapters/runtime";

export type RoomBookingSeed = {
  title: string;
  eventType?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  description?: string;
  targetingNotes?: string;
  numAttendees?: number;
};

export type LaunchRoomBookingOptions = {
  /** Optional Convex event id to scope the agent thread to an existing event. */
  eventId?: string;
  seed: RoomBookingSeed;
};

export function buildRoomBookingPrompt(seed: RoomBookingSeed): string {
  const lines: string[] = [];
  lines.push(
    "Help me book the Leslie eLab Lean/Launchpad room for the event below."
  );
  lines.push(
    "Use find_oncehub_slots to fetch live availability, then suggest a slot and propose book_oncehub_room (which will require my approval)."
  );
  lines.push("");
  lines.push("Event details:");
  lines.push(`- Title: ${seed.title || "Untitled event"}`);
  if (seed.eventType) lines.push(`- Type: ${seed.eventType}`);
  if (seed.date) lines.push(`- Target date: ${seed.date}`);
  if (seed.startTime || seed.endTime) {
    lines.push(
      `- Preferred time: ${seed.startTime ?? "TBD"} – ${seed.endTime ?? "TBD"}`
    );
  }
  if (seed.location) lines.push(`- Intended location: ${seed.location}`);
  if (seed.description) lines.push(`- Description: ${seed.description}`);
  if (seed.targetingNotes) lines.push(`- Targeting notes: ${seed.targetingNotes}`);
  if (seed.numAttendees) lines.push(`- Expected attendees: ${seed.numAttendees}`);
  return lines.join("\n");
}

/**
 * Launch a room-booking thread seeded with the current event context and
 * kick off a run. Returns the new thread id so the caller can route to
 * `/agent/<thread_id>`. Orchestration stays on Modal — this helper only
 * creates the thread and seeds the first user turn.
 */
export async function launchRoomBookingThread(
  options: LaunchRoomBookingOptions,
): Promise<{ threadId: string }> {
  const thread = await createThread({
    title: `Room booking · ${options.seed.title || "Untitled event"}`,
    contextLinks: options.eventId
      ? [
          {
            entityType: "event",
            entityId: options.eventId,
            label: options.seed.title || "Event",
          },
        ]
      : undefined,
  });
  await startRun(thread.id, buildRoomBookingPrompt(options.seed));
  return { threadId: thread.id };
}
