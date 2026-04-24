import { createThread, startRun } from "../adapters/runtime";

export type RoomBookingPromptInput = {
  title?: string;
  eventType?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  description?: string;
  targetingNotes?: string;
};

export type LaunchRoomBookingInput = {
  form: RoomBookingPromptInput;
  eventId?: string;
  threadTitleFallback?: string;
};

export type LaunchRoomBookingResult = {
  threadId: string;
};

/**
 * Compose the seed prompt sent to the agent for a Lean/Launchpad room-booking
 * conversation. Rendered as plain text so the dashboard and /agent behave the
 * same way regardless of entrypoint.
 */
export function buildRoomBookingPrompt(input: RoomBookingPromptInput): string {
  const lines: string[] = [
    "Please help me book the Leslie eLab Lean/Launchpad room via OnceHub.",
    "Use live OnceHub availability and pause for approval before booking.",
  ];

  const details: string[] = [];
  if (input.title) details.push(`Title: ${input.title}`);
  if (input.eventType) details.push(`Type: ${input.eventType}`);
  if (input.date) {
    details.push(
      input.startTime || input.endTime
        ? `When: ${input.date}${input.startTime ? ` ${input.startTime}` : ""}${
            input.endTime ? ` – ${input.endTime}` : ""
          }`
        : `Target date: ${input.date}`
    );
  }
  if (input.location) details.push(`Location notes: ${input.location}`);
  if (input.targetingNotes) details.push(`Targeting notes: ${input.targetingNotes}`);
  if (input.description) details.push(`Description: ${input.description}`);

  if (details.length > 0) {
    lines.push("");
    lines.push("Event details:");
    for (const entry of details) lines.push(`- ${entry}`);
  }

  lines.push("");
  lines.push(
    "Use `find_oncehub_slots` to list live availability, then propose the best " +
      "option. `book_oncehub_room` requires my approval before it runs."
  );
  return lines.join("\n");
}

/**
 * Thin dashboard launcher: create a thread (optionally linked to an event),
 * seed it with the room-booking prompt, and return the thread id. The caller
 * is responsible for routing the user to `/agent/{threadId}`.
 */
export async function launchRoomBookingThread({
  form,
  eventId,
  threadTitleFallback,
}: LaunchRoomBookingInput): Promise<LaunchRoomBookingResult> {
  const title =
    `Room booking · ${form.title?.trim() || threadTitleFallback || "Untitled event"}`;

  const thread = await createThread({
    title,
    contextLinks: eventId
      ? [
          {
            entityType: "event",
            entityId: eventId,
            label: form.title || threadTitleFallback || "Event",
          },
        ]
      : undefined,
  });

  await startRun(thread.id, buildRoomBookingPrompt(form));
  return { threadId: thread.id };
}
