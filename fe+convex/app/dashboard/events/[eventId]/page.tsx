"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { CalendarDays, MapPin } from "lucide-react";
import { DashboardPageShell } from "@/components/dashboard/PageShell";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";

type EventType = "Speaker Panel" | "Workshop" | "Networking" | "Social";
type EventStatus = "draft" | "matching" | "outreach" | "completed";

type FormState = {
  title: string;
  eventType: EventType;
  status: EventStatus;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  description: string;
  targetingNotes: string;
  needsOutreach: boolean;
};

const eventTypes: EventType[] = ["Speaker Panel", "Workshop", "Networking", "Social"];
const statusOptions: EventStatus[] = ["draft", "matching", "outreach", "completed"];

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[12px] font-medium text-[#555555]">{children}</label>;
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="h-10 w-full rounded-[8px] border border-[#E0E0E0] bg-transparent px-3 text-[13px] text-[#111111] placeholder:text-[#CCCCCC] outline-none transition focus:border-[#111111]"
    />
  );
}

function TextAreaInput({
  value,
  onChange,
  placeholder,
  rows,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  rows: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full resize-none rounded-[8px] border border-[#E0E0E0] bg-transparent px-3 py-2 text-[13px] text-[#111111] placeholder:text-[#CCCCCC] outline-none transition focus:border-[#111111]"
    />
  );
}

function DateInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function openPicker() {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.showPicker?.();
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-[8px] border border-[#E0E0E0] bg-transparent px-3 pr-10 text-[13px] text-[#111111] outline-none transition focus:border-[#111111]"
      />
      <button
        type="button"
        onClick={openPicker}
        aria-label="Open date picker"
        className="absolute right-0 top-0 inline-flex h-10 w-10 items-center justify-center text-[#AAAAAA] transition hover:text-[#555555]"
      >
        <CalendarDays className="h-4 w-4" />
      </button>
    </div>
  );
}

function TimeInput({
  value,
  onChange,
  onBlur,
  placeholder,
  listId,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  placeholder: string;
  listId: string;
}) {
  return (
    <>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        list={listId}
        autoComplete="off"
        className="h-10 w-full rounded-[8px] border border-[#E0E0E0] bg-transparent px-3 text-[13px] text-[#111111] placeholder:text-[#CCCCCC] outline-none transition focus:border-[#111111]"
      />
      <datalist id={listId}>
        {TIME_OPTIONS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </>
  );
}

function normalizeTimeInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const normalized = trimmed.toUpperCase().replace(/\./g, "").replace(/\s+/g, "");
  const match = normalized.match(/^(\d{1,2})(?::?(\d{2}))?([AP]M)$/);
  if (!match) return trimmed;

  const hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const meridiem = match[3];
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 1 || hour > 12 || minute < 0 || minute > 59) {
    return trimmed;
  }

  return `${hour}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

function parseTimeToMinutes(value: string) {
  const normalized = normalizeTimeInput(value);
  const match = normalized.match(/^(\d{1,2}):(\d{2}) ([AP]M)$/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3];
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;

  return (hour % 12 + (meridiem === "PM" ? 12 : 0)) * 60 + minute;
}

function formatPreviewDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "TBD";

  const parsed = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return trimmed;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function formatStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

const TIME_OPTIONS = Array.from({ length: 96 }, (_, index) => {
  const totalMinutes = index * 15;
  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const meridiem = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${meridiem}`;
});

function eventToForm(event: Doc<"events">): FormState {
  return {
    title: event.title,
    eventType: (event.event_type as EventType | undefined) ?? "Speaker Panel",
    status: (event.status as EventStatus | undefined) ?? "draft",
    date: event.event_date ?? "",
    startTime: event.event_time ?? "",
    endTime: event.event_end_time ?? "",
    location: event.location ?? "",
    description: event.description ?? "",
    targetingNotes: event.target_profile ?? "",
    needsOutreach: event.needs_outreach,
  };
}

function EventDetailEditor({
  event,
  eventId,
}: {
  event: Doc<"events">;
  eventId: Id<"events">;
}) {
  const router = useRouter();
  const updateEvent = useMutation((api.events as typeof api.events & { updateEvent: never }).updateEvent);
  const deleteEvent = useMutation((api.events as typeof api.events & { deleteEvent: never }).deleteEvent);

  const [form, setForm] = useState<FormState>(() => eventToForm(event));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "deleting">("idle");

  const normalizedStartTime = normalizeTimeInput(form.startTime);
  const normalizedEndTime = normalizeTimeInput(form.endTime);
  const startMinutes = parseTimeToMinutes(normalizedStartTime);
  const endMinutes = parseTimeToMinutes(normalizedEndTime);
  const timeValidationError =
    startMinutes !== null &&
    endMinutes !== null &&
    endMinutes < startMinutes
      ? "End time cannot be earlier than start time. Please pick another time."
      : null;

  const canSave = form.title.trim().length > 0 && !timeValidationError && saveState === "idle";
  const previewTime =
    normalizedStartTime || normalizedEndTime
      ? `${normalizedStartTime || "TBD"} - ${normalizedEndTime || "TBD"}`
      : "TBD";

  async function handleSave() {
    if (!canSave) return;

    setSaveState("saving");
    setSaveError(null);

    try {
      await updateEvent({
        event_id: eventId,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        event_date: form.date.trim() || undefined,
        event_time: normalizedStartTime || undefined,
        event_end_time: normalizedEndTime || undefined,
        location: form.location.trim() || undefined,
        event_type: form.eventType,
        target_profile: form.targetingNotes.trim() || undefined,
        needs_outreach: form.needsOutreach,
        status: form.status,
      });

      router.refresh();
      setSaveState("idle");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save event changes.";
      setSaveError(message);
      setSaveState("idle");
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm(`Delete "${event.title}"? This cannot be undone.`);
    if (!confirmed) return;

    setSaveState("deleting");
    setSaveError(null);

    try {
      await deleteEvent({ event_id: eventId });
      router.push("/dashboard/events");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not delete event.";
      setSaveError(message);
      setSaveState("idle");
    }
  }

  if (event === undefined) {
    return (
      <DashboardPageShell title="Events / Loading">
        <div className="rounded-[14px] border border-[#EBEBEB] bg-[#FFFFFF] p-6 text-[14px] text-[#6B6B6B]">
          Loading event...
        </div>
      </DashboardPageShell>
    );
  }

  if (!event) {
    return (
      <DashboardPageShell
        title="Events / Not Found"
        action={
          <Link
            href="/dashboard/events"
            className="inline-flex h-8 items-center rounded-[8px] border border-[#E0E0E0] px-3 text-[12px] font-medium text-[#7B7B7B] transition hover:bg-[#F4F4F4]"
          >
            Back to events
          </Link>
        }
      >
        <div className="rounded-[14px] border border-[#EBEBEB] bg-[#FFFFFF] p-6 text-[14px] text-[#6B6B6B]">
          That event could not be found.
        </div>
      </DashboardPageShell>
    );
  }

  return (
    <DashboardPageShell
      title={`Events / ${event.title}`}
      action={
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/events"
            className="inline-flex h-8 items-center rounded-[8px] border border-[#E0E0E0] px-3 text-[12px] font-medium text-[#7B7B7B] transition hover:bg-[#F4F4F4]"
          >
            Back
          </Link>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!canSave}
            className="inline-flex h-8 items-center rounded-[8px] bg-[#0A0A0A] px-3 text-[12px] font-semibold text-[#FFFFFF] transition hover:bg-[#1A1A1A] disabled:cursor-not-allowed disabled:bg-[#8A8A8A] disabled:text-[#F4F4F4]"
            title={timeValidationError ?? "Save changes"}
          >
            {saveState === "saving" ? "Saving..." : "Save changes"}
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={saveState !== "idle"}
            className="inline-flex h-8 items-center rounded-[8px] border border-[#F1D6DA] bg-[#FFFFFF] px-3 text-[12px] font-medium text-[#B42318] transition hover:bg-[#FFF5F5] disabled:cursor-not-allowed disabled:border-[#F3E1E4] disabled:text-[#D9A3AB]"
          >
            {saveState === "deleting" ? "Deleting..." : "Delete"}
          </button>
        </div>
      }
    >
      <section className="grid gap-6 font-[var(--font-geist-sans)] xl:grid-cols-[minmax(0,860px)_320px]">
        <div className="space-y-5">
          <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[#111111]">Event Details</h2>

          {saveError ? (
            <div className="rounded-[8px] border border-[#E0E0E0] bg-[#FAFAFA] px-3 py-2 text-[12px] text-[#555555]">
              {saveError}
            </div>
          ) : null}

          <div className="space-y-2">
            <FieldLabel>Event Title</FieldLabel>
            <TextInput
              value={form.title}
              onChange={(value) => setForm((prev) => ({ ...prev, title: value }))}
              placeholder="Event title"
            />
          </div>

          <div className="space-y-2">
            <FieldLabel>Event Type</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {eventTypes.map((type) => {
                const active = form.eventType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, eventType: type }))}
                    className={`h-8 rounded-[6px] px-3 text-[12px] transition ${
                      active
                        ? "border border-[#0A0A0A] bg-[#0A0A0A] font-semibold text-[#FFFFFF]"
                        : "border border-[#E0E0E0] bg-[#FAFAFA] font-medium text-[#7B7B7B] hover:bg-[#F4F4F4]"
                    }`}
                  >
                    {type}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3 md:gap-2 xl:grid-cols-[340px_220px_220px]">
            <div className="space-y-2">
              <FieldLabel>Date</FieldLabel>
              <DateInput value={form.date} onChange={(value) => setForm((prev) => ({ ...prev, date: value }))} />
            </div>
            <div className="space-y-2">
              <FieldLabel>Start Time</FieldLabel>
              <TimeInput
                value={form.startTime}
                onChange={(value) => setForm((prev) => ({ ...prev, startTime: value }))}
                onBlur={() => setForm((prev) => ({ ...prev, startTime: normalizeTimeInput(prev.startTime) }))}
                placeholder="6:30 PM"
                listId="detail-start-time-options"
              />
            </div>
            <div className="space-y-2">
              <FieldLabel>End Time</FieldLabel>
              <TimeInput
                value={form.endTime}
                onChange={(value) => setForm((prev) => ({ ...prev, endTime: value }))}
                onBlur={() => setForm((prev) => ({ ...prev, endTime: normalizeTimeInput(prev.endTime) }))}
                placeholder="7:30 PM"
                listId="detail-end-time-options"
              />
            </div>
          </div>

          {timeValidationError ? (
            <div
              role="alert"
              className="rounded-[8px] border border-[#F3C7CC] bg-[#FFF4F5] px-3 py-2 text-[12px] font-medium text-[#C2182B]"
            >
              {timeValidationError}
            </div>
          ) : null}

          <div className="space-y-2">
            <FieldLabel>Location</FieldLabel>
            <TextInput
              value={form.location}
              onChange={(value) => setForm((prev) => ({ ...prev, location: value }))}
              placeholder="Event location"
            />
          </div>

          <div className="space-y-2">
            <FieldLabel>Description</FieldLabel>
            <TextAreaInput
              value={form.description}
              onChange={(value) => setForm((prev) => ({ ...prev, description: value }))}
              placeholder="Describe your event..."
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <FieldLabel>Targeting Notes</FieldLabel>
            <TextAreaInput
              value={form.targetingNotes}
              onChange={(value) => setForm((prev) => ({ ...prev, targetingNotes: value }))}
              placeholder="Speaker names, companies, tags..."
              rows={3}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <FieldLabel>Status</FieldLabel>
              <select
                value={form.status}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as EventStatus }))}
                className="h-10 w-full rounded-[8px] border border-[#E0E0E0] bg-transparent px-3 text-[13px] text-[#111111] outline-none transition focus:border-[#111111]"
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {formatStatus(status)}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-3 rounded-[10px] border border-[#E0E0E0] bg-[#FAFAFA] px-3 py-3">
              <input
                type="checkbox"
                checked={form.needsOutreach}
                onChange={(event) => setForm((prev) => ({ ...prev, needsOutreach: event.target.checked }))}
                className="h-4 w-4 rounded border-[#D0D0D0]"
              />
              <div>
                <p className="text-[13px] font-medium text-[#111111]">Needs outreach</p>
                <p className="text-[11px] text-[#7B7B7B]">Keep matching/outreach workflows enabled.</p>
              </div>
            </label>
          </div>
        </div>

        <aside className="space-y-3">
          <div className="rounded-[12px] border border-[#E0E0E0] bg-[#FAFAFA] p-3">
            <h3 className="text-[12px] font-semibold text-[#111111]">Readiness</h3>
            <p className="mt-1 text-[11px] font-medium text-[#7B7B7B]">
              {event.speaker_confirmed ? "✓" : "○"} Speaker confirmed
            </p>
            <p className="mt-1 text-[11px] font-medium text-[#7B7B7B]">
              {event.room_confirmed ? "✓" : "○"} Room confirmed
            </p>
          </div>

          <div className="rounded-[12px] border border-[#EBEBEB] bg-[#FFFFFF] p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded-[4px] bg-[#F4F4F4] px-2 py-[2px] text-[10px] font-semibold text-[#3B3B3B]">
                {form.eventType}
              </span>
              <span className="rounded-[4px] border border-[#E0E0E0] px-2 py-[2px] text-[10px] font-medium text-[#999999]">
                {formatStatus(form.status)}
              </span>
            </div>

            <p className="text-[16px] font-semibold tracking-[-0.02em] text-[#111111]">
              {form.title.trim() || "Untitled event"}
            </p>

            <div className="mt-3 space-y-2 text-[12px] text-[#7B7B7B]">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-3.5 w-3.5" />
                <span>{formatPreviewDate(form.date)}</span>
              </div>
              <div className="flex items-center gap-2">
                <CalendarDays className="h-3.5 w-3.5" />
                <span>{previewTime}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5" />
                <span>{form.location.trim() || "Location TBD"}</span>
              </div>
            </div>

            {timeValidationError ? (
              <div className="mt-3 rounded-[8px] border border-[#F3C7CC] bg-[#FFF4F5] p-2">
                <p className="text-[11px] font-semibold text-[#C2182B]">Time needs attention</p>
                <p className="mt-1 text-[11px] text-[#C2182B]">{timeValidationError}</p>
              </div>
            ) : null}
          </div>
        </aside>
      </section>
    </DashboardPageShell>
  );
}

export default function EventDetailPage() {
  const params = useParams<{ eventId: string }>();
  const eventId = params.eventId as Id<"events">;
  const event = useQuery(api.events.getEvent, { event_id: eventId });

  if (event === undefined) {
    return (
      <DashboardPageShell title="Events / Loading">
        <div className="rounded-[14px] border border-[#EBEBEB] bg-[#FFFFFF] p-6 text-[14px] text-[#6B6B6B]">
          Loading event...
        </div>
      </DashboardPageShell>
    );
  }

  if (!event) {
    return (
      <DashboardPageShell
        title="Events / Not Found"
        action={
          <Link
            href="/dashboard/events"
            className="inline-flex h-8 items-center rounded-[8px] border border-[#E0E0E0] px-3 text-[12px] font-medium text-[#7B7B7B] transition hover:bg-[#F4F4F4]"
          >
            Back to events
          </Link>
        }
      >
        <div className="rounded-[14px] border border-[#EBEBEB] bg-[#FFFFFF] p-6 text-[14px] text-[#6B6B6B]">
          That event could not be found.
        </div>
      </DashboardPageShell>
    );
  }

  return <EventDetailEditor key={event._id} event={event} eventId={eventId} />;
}
