"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { CalendarDays, MapPin } from "lucide-react";
import { DashboardPageShell } from "@/components/dashboard/PageShell";
import { api } from "@/convex/_generated/api";

type EventType = "Speaker Panel" | "Workshop" | "Networking" | "Social";

type FormState = {
  title: string;
  eventType: EventType;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  description: string;
  targetingNotes: string;
};

type ChecklistItem = {
  key: string;
  label: string;
  done: boolean;
  phase: "required" | "later";
};

const eventTypes: EventType[] = ["Speaker Panel", "Workshop", "Networking", "Social"];

const defaultState: FormState = {
  title: "",
  eventType: "Speaker Panel",
  date: "",
  startTime: "",
  endTime: "",
  location: "",
  description: "",
  targetingNotes: "",
};

function FieldLabel({ children }: { children: ReactNode }) {
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

function buildEventTypeChecklist(eventType: EventType, hasSignals: boolean): ChecklistItem[] {
  const byType: Record<EventType, Array<{ key: string; label: string }>> = {
    "Speaker Panel": [
      { key: "speakers", label: "Speakers added (later)" },
      { key: "companies", label: "Companies added (later)" },
      { key: "tags", label: "Panel topic tags (later)" },
    ],
    Workshop: [
      { key: "facilitator", label: "Facilitator/speaker added (later)" },
      { key: "company", label: "Company context added (later)" },
      { key: "tags", label: "Workshop tags added (later)" },
    ],
    Networking: [
      { key: "partners", label: "Partner orgs added (later)" },
      { key: "audience", label: "Audience/theme tags (later)" },
      { key: "hosts", label: "Hosts added (later)" },
    ],
    Social: [
      { key: "hosts", label: "Host or MC added (later)" },
      { key: "cohosts", label: "Co-host orgs added (later)" },
      { key: "theme", label: "Theme tags added (later)" },
    ],
  };

  return byType[eventType].map((item) => ({
    key: item.key,
    label: item.label,
    done: hasSignals,
    phase: "later",
  }));
}

export default function NewEventPage() {
  const router = useRouter();
  const createEvent = useMutation(api.events.createEvent);

  const [form, setForm] = useState<FormState>(defaultState);
  const [submittingAction, setSubmittingAction] = useState<null | "create" | "matching">(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const titleReady = form.title.trim().length > 0;
  const dateReady = form.date.trim().length > 0;
  const hasSignals = form.targetingNotes.trim().length > 0;

  const canCreateEvent = titleReady && dateReady;
  const canStartMatching = titleReady;

  const checklistItems = useMemo(() => {
    const requiredItems: ChecklistItem[] = [
      { key: "title", label: "Title complete", done: titleReady, phase: "required" },
      { key: "date", label: "Date selected", done: dateReady, phase: "required" },
    ];

    return [...requiredItems, ...buildEventTypeChecklist(form.eventType, hasSignals)];
  }, [dateReady, form.eventType, hasSignals, titleReady]);

  const readinessWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (!titleReady) warnings.push("Event title is required.");
    if (!dateReady) warnings.push("Pick a date before creating the event.");
    return warnings;
  }, [dateReady, titleReady]);

  const laterMissingItems = checklistItems.filter((item) => item.phase === "later" && !item.done);

  const previewDate = form.date.trim() || "Mar 28, 2026";
  const previewTime =
    form.startTime.trim() || form.endTime.trim()
      ? `${form.startTime.trim() || "TBD"} - ${form.endTime.trim() || "TBD"}`
      : "TBD";

  async function handleCreate(mode: "create" | "matching") {
    if ((mode === "create" && !canCreateEvent) || (mode === "matching" && !canStartMatching)) {
      return;
    }

    setSubmittingAction(mode);
    setSubmitError(null);

    try {
      const eventId = await createEvent({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        event_date: form.date.trim() || undefined,
        event_time: form.startTime.trim() || undefined,
        event_end_time: form.endTime.trim() || undefined,
        location: form.location.trim() || undefined,
        event_type: form.eventType,
        target_profile: form.targetingNotes.trim() || undefined,
        needs_outreach: mode === "matching",
        status: mode === "matching" ? "matching" : "draft",
      });

      if (mode === "matching") {
        router.push(`/dashboard/events?matching=${eventId}`);
      } else {
        router.push("/dashboard/events");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create event. Try again.";
      setSubmitError(message);
      setSubmittingAction(null);
    }
  }

  return (
    <DashboardPageShell
      title="Events / Create Event"
      action={
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/events"
            className="inline-flex h-8 items-center rounded-[8px] border border-[#E0E0E0] px-3 text-[12px] font-medium text-[#7B7B7B] transition hover:bg-[#F4F4F4]"
          >
            Cancel
          </Link>
          <button
            type="button"
            disabled={!canCreateEvent || submittingAction !== null}
            onClick={() => void handleCreate("create")}
            className="inline-flex h-8 items-center rounded-[8px] border border-[#E0E0E0] px-3 text-[12px] font-medium text-[#3B3B3B] transition hover:bg-[#F4F4F4] disabled:cursor-not-allowed disabled:border-[#E6E6E6] disabled:bg-[#F4F4F4] disabled:text-[#A0A0A0]"
            title="Requires title + date"
          >
            {submittingAction === "create" ? "Creating..." : "Create Event"}
          </button>
          <button
            type="button"
            disabled={!canStartMatching || submittingAction !== null}
            onClick={() => void handleCreate("matching")}
            className="inline-flex h-8 items-center rounded-[8px] bg-[#0A0A0A] px-3 text-[12px] font-semibold text-[#FFFFFF] transition hover:bg-[#1A1A1A] disabled:cursor-not-allowed disabled:bg-[#8A8A8A] disabled:text-[#F4F4F4]"
            title="Starts the matching flow"
          >
            {submittingAction === "matching" ? "Starting..." : "Start Matching"}
          </button>
        </div>
      }
    >
      <section className="grid gap-6 font-[var(--font-geist-sans)] xl:grid-cols-[minmax(0,860px)_320px]">
        <div className="order-2 w-full max-w-[860px] space-y-5 xl:order-1">
          <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[#111111]">Create Event</h2>

          <div className="inline-flex w-fit rounded-[6px] bg-[#F4F4F4] px-3 py-1 text-[11px] font-semibold text-[#3B3B3B]">
            Required now: Event Title
          </div>

          {submitError ? (
            <div className="rounded-[8px] border border-[#E0E0E0] bg-[#FAFAFA] px-3 py-2 text-[12px] text-[#555555]">
              {submitError}
            </div>
          ) : null}

          <div className="space-y-2">
            <FieldLabel>Event Title (required)</FieldLabel>
            <TextInput
              value={form.title}
              onChange={(value) => setForm((prev) => ({ ...prev, title: value }))}
              placeholder="e.g. AI & Society Speaker Panel"
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

          <div className="space-y-1 text-[11px] text-[#999999]">
            <p>Assume selected date is target date; update later if needed.</p>
            <p>No final-date toggle. Date can be updated later.</p>
          </div>

          <div className="grid gap-3 md:grid-cols-3 md:gap-2 xl:grid-cols-[340px_220px_220px]">
            <div className="space-y-2">
              <FieldLabel>Date (required)</FieldLabel>
              <div className="relative">
                <TextInput
                  value={form.date}
                  onChange={(value) => setForm((prev) => ({ ...prev, date: value }))}
                  placeholder="Select date"
                />
                <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#AAAAAA]" />
              </div>
            </div>
            <div className="space-y-2">
              <FieldLabel>Start Time (optional)</FieldLabel>
              <TextInput
                value={form.startTime}
                onChange={(value) => setForm((prev) => ({ ...prev, startTime: value }))}
                placeholder="TBD"
              />
            </div>
            <div className="space-y-2">
              <FieldLabel>End Time (optional)</FieldLabel>
              <TextInput
                value={form.endTime}
                onChange={(value) => setForm((prev) => ({ ...prev, endTime: value }))}
                placeholder="TBD"
              />
            </div>
          </div>

          <div className="space-y-2">
            <FieldLabel>Location</FieldLabel>
            <TextInput
              value={form.location}
              onChange={(value) => setForm((prev) => ({ ...prev, location: value }))}
              placeholder="e.g. Tandon School of Engineering"
            />
          </div>

          <div className="space-y-2">
            <FieldLabel>Description</FieldLabel>
            <TextAreaInput
              value={form.description}
              onChange={(value) => setForm((prev) => ({ ...prev, description: value }))}
              placeholder="Describe your event..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <FieldLabel>Targeting (optional mix)</FieldLabel>
            <TextAreaInput
              value={form.targetingNotes}
              onChange={(value) => setForm((prev) => ({ ...prev, targetingNotes: value }))}
              placeholder="Add speaker names, companies, and tags in any combination..."
              rows={2}
            />
          </div>
        </div>

        <aside className="order-1 space-y-3 xl:order-2">
          <div className="rounded-[12px] border border-[#E0E0E0] bg-[#FAFAFA] p-3">
            <h3 className="text-[12px] font-semibold text-[#111111]">Readiness Checklist ({form.eventType})</h3>
            {checklistItems.map((item) => (
              <p key={item.key} className="mt-1 text-[11px] font-medium text-[#7B7B7B]">
                {item.done ? "✓" : "○"} {item.label}
              </p>
            ))}
          </div>

          <div className="rounded-[12px] border border-[#EBEBEB] bg-[#FFFFFF] p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded-[4px] bg-[#F4F4F4] px-2 py-[2px] text-[10px] font-semibold text-[#3B3B3B]">
                {form.eventType}
              </span>
              <span className="rounded-[4px] border border-[#E0E0E0] px-2 py-[2px] text-[10px] font-medium text-[#999999]">
                Draft · Create Event
              </span>
            </div>

            <p className="text-[16px] font-semibold tracking-[-0.02em] text-[#111111]">
              {form.title.trim() || "AI & Society Speaker Panel"}
            </p>

            <div className="mt-3 space-y-2 text-[12px] text-[#7B7B7B]">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-3.5 w-3.5" />
                <span>{previewDate}</span>
              </div>
              <div className="flex items-center gap-2">
                <CalendarDays className="h-3.5 w-3.5" />
                <span>{previewTime}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5" />
                <span>{form.location.trim() || "Tandon School of Engineering"}</span>
              </div>
            </div>

            {readinessWarnings.length > 0 ? (
              <div className="mt-3 rounded-[8px] border border-[#E0E0E0] bg-[#FAFAFA] p-2">
                <p className="text-[11px] font-semibold text-[#555555]">Required Before Create Event</p>
                <ul className="mt-1 list-disc pl-4 text-[11px] text-[#7B7B7B]">
                  {readinessWarnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {laterMissingItems.length > 0 ? (
              <p className="mt-3 text-[11px] text-[#999999]">
                Add later for {form.eventType}: {laterMissingItems.map((item) => item.label).join(", ")}.
              </p>
            ) : null}
          </div>
        </aside>
      </section>
    </DashboardPageShell>
  );
}
