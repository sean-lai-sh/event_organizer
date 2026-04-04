"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Clock3, FileEdit, LayoutList, Users2 } from "lucide-react";
import { DashboardPageShell } from "@/components/dashboard/PageShell";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type DetailTab = "overview" | "attendees" | "activity" | "capture";

function formatShortDate(value?: string | null) {
  if (!value) return "TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCompactTimestamp(value?: number | null) {
  if (!value) return "No activity yet";
  const date = new Date(value);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatSourceLabel(source?: string | null) {
  if (!source) return "unknown";
  return source.replace(/_/g, " ");
}

function DetailStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-[16px] border border-[#E8E8E8] bg-[#FFFFFF] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9A9A9A]">
        {label}
      </p>
      <p className="mt-2 text-[18px] font-semibold tracking-[-0.03em] text-[#111111]">{value}</p>
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[180px] items-center justify-center px-6 py-10">
      <div className="max-w-[360px] text-center">
        <h3 className="text-[16px] font-semibold tracking-[-0.02em] text-[#151515]">{title}</h3>
        <p className="mt-2 text-[13px] leading-6 text-[#747474]">{description}</p>
      </div>
    </div>
  );
}

export default function EventDataDetailPage() {
  const params = useParams<{ eventId: string }>();
  const events = useQuery(api.events.listEvents, {});
  const matchedEvent = events?.find((event) => event._id === params.eventId) ?? null;
  const eventId = matchedEvent?._id as Id<"events"> | undefined;
  const detail = useQuery(api.attendance.getEventAttendanceDetail, {
    event_id: params.eventId,
  });
  const upsertAttendanceBatch = useMutation(api.attendance.upsertAttendanceBatch);
  const recordAttendanceInsight = useMutation(api.attendance.recordAttendanceInsight);

  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [selectedEventId, setSelectedEventId] = useState<Id<"events"> | "">(eventId ?? "");
  const [attendeeName, setAttendeeName] = useState("");
  const [attendeeEmail, setAttendeeEmail] = useState("");
  const [attendeeSource, setAttendeeSource] = useState("manual");
  const [insightText, setInsightText] = useState("");
  const [attendeeSearch, setAttendeeSearch] = useState("");
  const [submittingAttendance, setSubmittingAttendance] = useState(false);
  const [submittingInsight, setSubmittingInsight] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setSelectedEventId(eventId ?? "");
  }, [eventId]);

  useEffect(() => {
    if (detail?.event) {
      setInsightText((current) => current || detail.insight_summary);
    }
  }, [detail]);

  const attendees = detail?.attendees ?? [];
  const recentActivity = detail?.recent_activity ?? [];
  const attendeeQuery = attendeeSearch.trim().toLowerCase();
  const filteredAttendees = attendeeQuery
    ? attendees.filter((attendee) =>
        [attendee.name ?? "", attendee.email].some((value) =>
          value.toLowerCase().includes(attendeeQuery)
        )
      )
    : attendees;

  async function handleAttendanceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!selectedEventId || !attendeeEmail.trim()) {
      setMessage("Event and attendee email are required.");
      return;
    }

    setSubmittingAttendance(true);
    try {
      const result = await upsertAttendanceBatch({
        event_id: selectedEventId,
        attendees: [
          {
            email: attendeeEmail,
            name: attendeeName || undefined,
            source: attendeeSource,
          },
        ],
      });
      setMessage(
        `Logged ${result.inserted_count + result.updated_count} attendee record for ${result.event_title}.`
      );
      setAttendeeName("");
      setAttendeeEmail("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to log attendance.");
    } finally {
      setSubmittingAttendance(false);
    }
  }

  async function handleInsightSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!insightText.trim()) {
      setMessage("Insight text is required.");
      return;
    }

    setSubmittingInsight(true);
    try {
      await recordAttendanceInsight({
        insight_text: insightText,
      });
      setMessage("Saved snapshot note.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save snapshot note.");
    } finally {
      setSubmittingInsight(false);
    }
  }

  return (
    <DashboardPageShell
      title={matchedEvent?.title ?? detail?.event.title ?? "Event Data"}
      action={
        <Link
          href="/dashboard/data"
          className="inline-flex items-center gap-2 rounded-full border border-[#E1E1E1] bg-[#FFFFFF] px-3 py-1.5 text-[12px] font-medium text-[#111111] transition hover:bg-[#F6F6F6]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Data
        </Link>
      }
    >
      {events !== undefined && !matchedEvent ? (
        <section className="rounded-[20px] border border-[#EAEAEA] bg-[#FFFFFF] px-6 py-6">
          <EmptyState
            title="Event not found"
            description="This detail link does not point to a current event record. Return to Data and reopen an event from the latest list."
          />
        </section>
      ) : null}

      {matchedEvent && detail?.event ? (
        <>
      <section className="rounded-[20px] border border-[#EAEAEA] bg-[#FFFFFF] px-6 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-[760px]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#949494]">
              Event Attendance Detail
            </p>
            <h2 className="mt-2 text-[26px] font-semibold tracking-[-0.04em] text-[#111111]">
              {detail?.event.title ?? "Loading event..."}
            </h2>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-[#666666]">
              <span>{formatShortDate(detail?.event.event_date)}</span>
              {detail?.event.event_type ? <span>{detail.event.event_type}</span> : null}
              <span>{detail?.summary.total_check_ins ?? 0} attendees</span>
              <span>{formatCompactTimestamp(detail?.summary.latest_check_in_at)}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DetailStat label="attendees" value={detail?.summary.total_check_ins ?? 0} />
        <DetailStat label="unique attendees" value={detail?.summary.unique_attendees ?? 0} />
        <DetailStat label="manual entries" value={detail?.summary.manual_entries ?? 0} />
        <DetailStat label="CSV imports" value={detail?.summary.csv_imports ?? 0} />
      </section>

      <section className="rounded-[20px] border border-[#E7E7E7] bg-[#111111] p-5 text-[#FFFFFF]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#BEBEBE]">
          Event Insight Summary
        </p>
        <p className="mt-3 max-w-[900px] text-[14px] leading-6 text-[#F0F0F0]">
          {detail?.insight_summary ??
            "Loading attendance signal for this event. Once ready, this card summarizes turnout, capture mix, and repeat-attendance signal."}
        </p>
      </section>

      <section className="rounded-[18px] border border-[#E8E8E8] bg-[#FCFCFC] p-2">
        <div className="flex flex-wrap gap-2">
          {([
            ["overview", "Overview"],
            ["attendees", "Attendees"],
            ["activity", "Activity"],
            ["capture", "Capture / Notes"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setActiveTab(value)}
              className={`rounded-[12px] px-4 py-2 text-[13px] font-medium transition ${
                activeTab === value
                  ? "bg-[#111111] text-[#FFFFFF]"
                  : "bg-[#FFFFFF] text-[#555555] hover:bg-[#F2F2F2]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {message ? (
        <section className="rounded-[16px] border border-[#E6E6E6] bg-[#F8F8F8] px-4 py-3 text-[13px] text-[#444444]">
          {message}
        </section>
      ) : null}

      {activeTab === "overview" ? (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="rounded-[22px] border border-[#E9E9E9] bg-[#FFFFFF] p-5">
            <div className="flex items-center gap-2">
              <LayoutList className="h-4 w-4 text-[#767676]" strokeWidth={1.8} />
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#999999]">
                Overview
              </p>
            </div>
            <div className="mt-4 space-y-4">
              <div className="rounded-[16px] border border-[#E8E8E8] bg-[#FCFCFC] p-4">
                <p className="text-[12px] font-medium text-[#111111]">Attendance summary</p>
                <p className="mt-2 text-[13px] leading-6 text-[#666666]">
                  {detail
                    ? `${detail.summary.total_check_ins} check-ins are recorded for this event, with ${detail.summary.unique_attendees} unique attendees and ${detail.summary.repeat_attendee_count} repeat-attendance signal${
                        detail.summary.repeat_attendee_count === 1 ? "" : "s"
                      }.`
                    : "Loading attendance summary..."}
                </p>
              </div>
              <div className="rounded-[16px] border border-[#E8E8E8] bg-[#FCFCFC] p-4">
                <p className="text-[12px] font-medium text-[#111111]">Source mix</p>
                <div className="mt-3 space-y-3">
                  {detail && Object.entries(detail.summary.source_counts).length > 0 ? (
                    Object.entries(detail.summary.source_counts)
                      .sort((a, b) => b[1] - a[1])
                      .map(([source, count]) => (
                        <div key={source} className="flex items-center justify-between text-[13px]">
                          <span className="capitalize text-[#444444]">
                            {formatSourceLabel(source)}
                          </span>
                          <span className="font-medium text-[#111111]">{count}</span>
                        </div>
                      ))
                  ) : (
                    <p className="text-[13px] text-[#666666]">No source data yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[22px] border border-[#E9E9E9] bg-[#FFFFFF] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#999999]">
              Quick facts
            </p>
            <div className="mt-4 space-y-4 text-[13px] text-[#666666]">
              <div>
                <p className="font-medium text-[#111111]">Event date</p>
                <p className="mt-1">{formatShortDate(detail?.event.event_date)}</p>
              </div>
              <div>
                <p className="font-medium text-[#111111]">Event type</p>
                <p className="mt-1">{detail?.event.event_type ?? "Not set"}</p>
              </div>
              <div>
                <p className="font-medium text-[#111111]">Last updated</p>
                <p className="mt-1">{formatCompactTimestamp(detail?.summary.latest_check_in_at)}</p>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "attendees" ? (
        <section className="overflow-hidden rounded-[22px] border border-[#E9E9E9] bg-[#FFFFFF]">
          <div className="flex flex-col gap-3 border-b border-[#EFEFEF] px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9F9F9F]">
                Attendees
              </p>
              <h3 className="mt-2 text-[18px] font-semibold tracking-[-0.03em] text-[#111111]">
                Who attended
              </h3>
            </div>
            <input
              value={attendeeSearch}
              onChange={(event) => setAttendeeSearch(event.target.value)}
              placeholder="Search attendees"
              className="h-11 w-full rounded-[12px] border border-[#E2E2E2] bg-[#FFFFFF] px-3 text-[14px] text-[#111111] outline-none transition placeholder:text-[#9A9A9A] focus:border-[#111111] lg:w-[260px]"
            />
          </div>

          {detail === undefined ? (
            <div className="space-y-3 px-5 py-5">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-12 animate-pulse rounded-[14px] border border-[#EFEFEF] bg-[#F7F7F7]"
                />
              ))}
            </div>
          ) : filteredAttendees.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#F0F0F0] bg-[#FAFAFA]">
                    {["Attendee", "Source", "Check-in", "Repeat"].map((heading) => (
                      <th
                        key={heading}
                        className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A0A0A0]"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F1F1]">
                  {filteredAttendees.map((attendee) => (
                    <tr key={attendee._id}>
                      <td className="px-5 py-4">
                        <p className="text-[14px] font-medium text-[#111111]">
                          {attendee.name ?? attendee.email}
                        </p>
                        <p className="mt-1 text-[12px] text-[#8A8A8A]">{attendee.email}</p>
                      </td>
                      <td className="px-5 py-4 text-[13px] text-[#5E5E5E]">
                        {formatSourceLabel(attendee.source)}
                      </td>
                      <td className="px-5 py-4 text-[13px] text-[#5E5E5E]">
                        {formatCompactTimestamp(attendee.checked_in_at)}
                      </td>
                      <td className="px-5 py-4">
                        {attendee.repeat_event_count > 1 ? (
                          <span className="rounded-full border border-[#DEDEDE] bg-[#F7F7F7] px-2.5 py-1 text-[11px] font-semibold text-[#444444]">
                            {attendee.repeat_event_count}x
                          </span>
                        ) : (
                          <span className="text-[12px] text-[#8A8A8A]">First seen</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No matching attendees"
              description="Try a different search term or wait until attendees have been recorded for this event."
            />
          )}
        </section>
      ) : null}

      {activeTab === "activity" ? (
        <section className="rounded-[22px] border border-[#E9E9E9] bg-[#FFFFFF] px-5 py-3">
          <div className="border-b border-[#EFEFEF] py-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9F9F9F]">
              Activity
            </p>
            <h3 className="mt-2 text-[18px] font-semibold tracking-[-0.03em] text-[#111111]">
              Recent check-ins timeline
            </h3>
          </div>

          {detail === undefined ? (
            <div className="space-y-3 py-5">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className="h-12 animate-pulse rounded-[14px] border border-[#EFEFEF] bg-[#F7F7F7]"
                />
              ))}
            </div>
          ) : recentActivity.length > 0 ? (
            <div className="py-3">
              {recentActivity.map((entry, index) => (
                <div key={entry._id} className="flex gap-3 py-3">
                  <div className="flex w-8 flex-col items-center">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E5E5E5] bg-[#F8F8F8]">
                      <Clock3 className="h-3.5 w-3.5 text-[#737373]" strokeWidth={1.8} />
                    </div>
                    {index < recentActivity.length - 1 ? (
                      <div className="mt-2 h-full w-px bg-[#ECECEC]" />
                    ) : null}
                  </div>
                  <div className="flex min-w-0 flex-1 items-start justify-between gap-4 rounded-[14px] border border-[#F0F0F0] bg-[#FCFCFC] px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-[#111111]">
                        {entry.name ?? entry.email}
                      </p>
                      <p className="mt-1 text-[12px] text-[#8A8A8A]">{entry.email}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="inline-flex rounded-full border border-[#E0E0E0] bg-[#F7F7F7] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#707070]">
                        {formatSourceLabel(entry.source)}
                      </p>
                      <p className="mt-1.5 text-[11px] text-[#666666]">
                        {formatCompactTimestamp(entry.checked_in_at)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No recent activity"
              description="Once attendees are recorded, this timeline will show the most recent movement for this event."
            />
          )}
        </section>
      ) : null}

      {activeTab === "capture" ? (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_1fr]">
          <form
            onSubmit={handleAttendanceSubmit}
            className="rounded-[20px] border border-[#E9E9E9] bg-[#FFFFFF] p-5"
          >
            <div className="flex items-center gap-2">
              <Users2 className="h-4 w-4 text-[#767676]" strokeWidth={1.8} />
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#999999]">
                Manual Check-In
              </p>
            </div>
            <h3 className="mt-3 text-[16px] font-semibold tracking-[-0.02em] text-[#111111]">
              Log one attendee
            </h3>
            <p className="mt-2 text-[13px] leading-6 text-[#6C6C6C]">
              Use this for corrections, door updates, or quick one-off attendance capture.
            </p>

            <div className="mt-5 space-y-3">
              <select
                value={selectedEventId}
                onChange={(event) =>
                  setSelectedEventId(event.target.value as Id<"events"> | "")
                }
                className="h-11 w-full rounded-[12px] border border-[#E2E2E2] bg-[#FCFCFC] px-3 text-[14px] text-[#111111] outline-none transition focus:border-[#111111]"
                disabled={!events || events.length === 0 || submittingAttendance}
              >
                <option value="">Select an event</option>
                {(events ?? []).map((event) => (
                  <option key={event._id} value={event._id}>
                    {event.title}
                  </option>
                ))}
              </select>

              <input
                value={attendeeName}
                onChange={(event) => setAttendeeName(event.target.value)}
                placeholder="Attendee name"
                className="h-11 w-full rounded-[12px] border border-[#E2E2E2] bg-[#FCFCFC] px-3 text-[14px] text-[#111111] outline-none transition placeholder:text-[#9A9A9A] focus:border-[#111111]"
                disabled={submittingAttendance}
              />

              <input
                value={attendeeEmail}
                onChange={(event) => setAttendeeEmail(event.target.value)}
                placeholder="Attendee email"
                className="h-11 w-full rounded-[12px] border border-[#E2E2E2] bg-[#FCFCFC] px-3 text-[14px] text-[#111111] outline-none transition placeholder:text-[#9A9A9A] focus:border-[#111111]"
                disabled={submittingAttendance}
              />

              <select
                value={attendeeSource}
                onChange={(event) => setAttendeeSource(event.target.value)}
                className="h-11 w-full rounded-[12px] border border-[#E2E2E2] bg-[#FCFCFC] px-3 text-[14px] text-[#111111] outline-none transition focus:border-[#111111]"
                disabled={submittingAttendance}
              >
                <option value="manual">manual</option>
                <option value="csv_import">csv import</option>
                <option value="door_list">door list</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={submittingAttendance || !events || events.length === 0}
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-[12px] bg-[#111111] px-4 text-[13px] font-semibold text-[#FFFFFF] transition hover:bg-[#1A1A1A] disabled:cursor-not-allowed disabled:bg-[#B5B5B5]"
            >
              {submittingAttendance ? "Logging..." : "Log attendance"}
            </button>
          </form>

          <form
            onSubmit={handleInsightSubmit}
            className="rounded-[20px] border border-[#E9E9E9] bg-[#FFFFFF] p-5"
          >
            <div className="flex items-center gap-2">
              <FileEdit className="h-4 w-4 text-[#767676]" strokeWidth={1.8} />
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#999999]">
                Snapshot Note
              </p>
            </div>
            <h3 className="mt-3 text-[16px] font-semibold tracking-[-0.02em] text-[#111111]">
              Save the event takeaway
            </h3>
            <p className="mt-2 text-[13px] leading-6 text-[#6C6C6C]">
              Persist a clean read after reviewing this event’s turnout and activity.
            </p>

            <textarea
              value={insightText}
              onChange={(event) => setInsightText(event.target.value)}
              rows={8}
              className="mt-5 w-full rounded-[12px] border border-[#E2E2E2] bg-[#FCFCFC] px-3 py-3 text-[14px] leading-6 text-[#111111] outline-none transition placeholder:text-[#9A9A9A] focus:border-[#111111]"
              disabled={submittingInsight}
            />

            <button
              type="submit"
              disabled={submittingInsight}
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-[12px] border border-[#111111] bg-[#FFFFFF] px-4 text-[13px] font-semibold text-[#111111] transition hover:bg-[#F3F3F3] disabled:cursor-not-allowed disabled:border-[#D0D0D0] disabled:text-[#9A9A9A]"
            >
              {submittingInsight ? "Saving..." : "Save snapshot note"}
            </button>
          </form>
        </section>
      ) : null}
        </>
      ) : null}
    </DashboardPageShell>
  );
}
