"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { DashboardPageShell } from "@/components/dashboard/PageShell";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

function formatDate(value?: string | null) {
  if (!value) return "TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function formatTimestamp(value?: number | null) {
  if (!value) return "No activity yet";
  return new Date(value).toLocaleString();
}

function formatSourceLabel(source: string) {
  return source.replace(/_/g, " ");
}

export default function DataInsightsPage() {
  const events = useQuery(api.events.listEvents, {});
  const dashboard = useQuery(api.attendance.getAttendanceDashboard, {});
  const upsertAttendanceBatch = useMutation(api.attendance.upsertAttendanceBatch);
  const recordAttendanceInsight = useMutation(api.attendance.recordAttendanceInsight);

  const [selectedEventId, setSelectedEventId] = useState<Id<"events"> | "">("");
  const [attendeeName, setAttendeeName] = useState("");
  const [attendeeEmail, setAttendeeEmail] = useState("");
  const [attendeeSource, setAttendeeSource] = useState("manual");
  const [insightText, setInsightText] = useState("");
  const [submittingAttendance, setSubmittingAttendance] = useState(false);
  const [submittingInsight, setSubmittingInsight] = useState(false);
  const [attendanceMessage, setAttendanceMessage] = useState<string | null>(null);
  const [insightMessage, setInsightMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedEventId && events && events.length > 0) {
      setSelectedEventId(events[0]._id);
    }
  }, [events, selectedEventId]);

  const totals = dashboard?.totals ?? {
    events_tracked: 0,
    unique_attendees: 0,
    total_check_ins: 0,
    latest_check_in_at: null,
    by_source: {},
  };
  const trackedEvents = dashboard?.event_breakdown ?? [];
  const repeatAttendees = dashboard?.repeat_attendees ?? [];
  const recentAttendance = dashboard?.recent_attendance ?? [];
  const latestInsight = dashboard?.latest_insight ?? null;
  const sourceEntries = Object.entries(totals.by_source).sort((a, b) => b[1] - a[1]);

  async function handleAttendanceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setAttendanceMessage(null);

    if (!selectedEventId) {
      setErrorMessage("Create an event before logging attendance.");
      return;
    }

    if (!attendeeEmail.trim()) {
      setErrorMessage("Attendee email is required.");
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
      setAttendanceMessage(
        `Logged ${result.inserted_count + result.updated_count} attendee record for ${result.event_title}.`
      );
      setAttendeeName("");
      setAttendeeEmail("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to log attendance.");
    } finally {
      setSubmittingAttendance(false);
    }
  }

  async function handleInsightSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setInsightMessage(null);

    if (!insightText.trim()) {
      setErrorMessage("Insight text is required.");
      return;
    }

    setSubmittingInsight(true);
    try {
      await recordAttendanceInsight({
        insight_text: insightText,
      });
      setInsightMessage("Saved attendance snapshot.");
      setInsightText("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save insight.");
    } finally {
      setSubmittingInsight(false);
    }
  }

  return (
    <DashboardPageShell
      title="Data Insights"
      action={
        <div className="rounded-[10px] border border-[#E5E5E5] bg-[#F6F6F6] px-3 py-2 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9A9A9A]">
            Latest Snapshot
          </p>
          <p className="mt-1 text-[12px] font-medium text-[#111111]">
            {latestInsight ? formatTimestamp(latestInsight.generated_at) : "No saved insight yet"}
          </p>
        </div>
      }
    >
      <section className="overflow-hidden rounded-[22px] border border-[#E6E6E6] bg-[linear-gradient(135deg,#FFFFFF_0%,#F5F5F5_55%,#EEEEEE_100%)]">
        <div className="grid gap-6 px-6 py-6 xl:grid-cols-[minmax(0,1.35fr)_320px]">
          <div className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8C8C8C]">
              Attendance Ledger
            </p>
            <div className="max-w-3xl space-y-3">
              <h2 className="font-[var(--font-outfit)] text-[42px] font-light leading-[0.95] tracking-[-0.05em] text-[#111111]">
                Restore the operational record for who actually showed up.
              </h2>
              <p className="max-w-2xl text-[14px] leading-6 text-[#5F5F5F]">
                Attendance is tracked in Convex again with event-scoped dedupe, recent check-ins,
                repeat-attendee detection, and append-only insight snapshots for the dashboard.
              </p>
            </div>
          </div>

          <div className="rounded-[18px] border border-[#DADADA] bg-[#111111] p-5 text-[#FFFFFF]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#BBBBBB]">
              Source Mix
            </p>
            <div className="mt-4 space-y-3">
              {sourceEntries.length > 0 ? (
                sourceEntries.map(([source, count]) => (
                  <div
                    key={source}
                    className="flex items-center justify-between border-b border-[#2A2A2A] pb-3 last:border-b-0 last:pb-0"
                  >
                    <span className="text-[13px] capitalize text-[#D6D6D6]">
                      {formatSourceLabel(source)}
                    </span>
                    <span className="font-[var(--font-outfit)] text-[28px] font-light tracking-[-0.04em]">
                      {count}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-[13px] text-[#B5B5B5]">
                  No attendance imports yet. Use the form below to start the ledger.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "tracked events",
            value: totals.events_tracked,
            hint: "events with at least one check-in",
          },
          {
            label: "unique attendees",
            value: totals.unique_attendees,
            hint: "deduped by normalized email",
          },
          {
            label: "total check-ins",
            value: totals.total_check_ins,
            hint: "all attendance rows across events",
          },
          {
            label: "latest activity",
            value: totals.latest_check_in_at ? formatTimestamp(totals.latest_check_in_at) : "No activity",
            hint: "most recent recorded attendance",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-[18px] border border-[#EAEAEA] bg-[#FAFAFA] p-4"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9B9B9B]">
              {card.label}
            </p>
            <p className="mt-3 font-[var(--font-outfit)] text-[32px] font-light tracking-[-0.05em] text-[#111111]">
              {card.value}
            </p>
            <p className="mt-2 text-[12px] text-[#7D7D7D]">{card.hint}</p>
          </div>
        ))}
      </section>

      {(errorMessage || attendanceMessage || insightMessage) && (
        <section className="rounded-[14px] border border-[#E5E5E5] bg-[#F7F7F7] px-4 py-3 text-[13px] text-[#444444]">
          {errorMessage ?? attendanceMessage ?? insightMessage}
        </section>
      )}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_360px]">
        <div className="overflow-hidden rounded-[18px] border border-[#E9E9E9] bg-[#FFFFFF]">
          <div className="flex items-center justify-between border-b border-[#ECECEC] px-5 py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#999999]">
                Event Breakdown
              </p>
              <h3 className="mt-1 text-[16px] font-semibold text-[#111111]">
                Attendance by event
              </h3>
            </div>
            <p className="text-[12px] text-[#7A7A7A]">
              Sorted by attendee volume, then latest activity
            </p>
          </div>

          {dashboard === undefined ? (
            <div className="p-6 text-[14px] text-[#6F6F6F]">Loading attendance data...</div>
          ) : trackedEvents.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#ECECEC] bg-[#F8F8F8]">
                    {["Event", "Date", "Attendees", "Latest check-in", "Sources"].map((heading) => (
                      <th
                        key={heading}
                        className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9B9B9B]"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F0F0]">
                  {trackedEvents.map((event) => (
                    <tr key={event.event_id} className="align-top hover:bg-[#FBFBFB]">
                      <td className="px-5 py-4">
                        <p className="text-[14px] font-medium text-[#111111]">{event.title}</p>
                        <p className="mt-1 text-[12px] text-[#8A8A8A]">
                          Convex event id: {event.event_id}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-[13px] text-[#5C5C5C]">
                        {formatDate(event.event_date)}
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-[var(--font-outfit)] text-[28px] font-light tracking-[-0.04em] text-[#111111]">
                          {event.attendee_count}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-[13px] text-[#5C5C5C]">
                        {formatTimestamp(event.latest_check_in_at)}
                      </td>
                      <td className="px-5 py-4 text-[12px] text-[#5F5F5F]">
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(event.sources).map(([source, count]) => (
                            <span
                              key={source}
                              className="rounded-full border border-[#DDDDDD] bg-[#F6F6F6] px-2.5 py-1 capitalize"
                            >
                              {formatSourceLabel(source)} {count}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-[14px] text-[#6F6F6F]">
              No attendance records yet. Log an attendee to start the event breakdown.
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="rounded-[18px] border border-[#E9E9E9] bg-[#FFFFFF] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#999999]">
              Latest Insight
            </p>
            {latestInsight ? (
              <div className="mt-3 space-y-3">
                <p className="text-[15px] leading-6 text-[#1C1C1C]">
                  {latestInsight.insight_text}
                </p>
                <div className="grid grid-cols-2 gap-3 text-[12px] text-[#707070]">
                  <div className="rounded-[12px] border border-[#ECECEC] bg-[#FAFAFA] p-3">
                    <p className="uppercase tracking-[0.12em] text-[#A0A0A0]">events</p>
                    <p className="mt-2 text-[18px] font-semibold text-[#111111]">
                      {latestInsight.event_count}
                    </p>
                  </div>
                  <div className="rounded-[12px] border border-[#ECECEC] bg-[#FAFAFA] p-3">
                    <p className="uppercase tracking-[0.12em] text-[#A0A0A0]">attendees</p>
                    <p className="mt-2 text-[18px] font-semibold text-[#111111]">
                      {latestInsight.attendee_count}
                    </p>
                  </div>
                </div>
                <p className="text-[12px] text-[#8A8A8A]">
                  Saved {formatTimestamp(latestInsight.generated_at)}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-[13px] leading-6 text-[#6B6B6B]">
                No saved insight yet. Capture one after reviewing the attendance patterns below.
              </p>
            )}
          </div>

          <form
            onSubmit={handleAttendanceSubmit}
            className="rounded-[18px] border border-[#E9E9E9] bg-[#FFFFFF] p-5"
          >
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#999999]">
                Manual Check-In
              </p>
              <h3 className="text-[16px] font-semibold text-[#111111]">Log one attendee</h3>
            </div>

            <div className="mt-4 space-y-3">
              <select
                value={selectedEventId}
                onChange={(event) =>
                  setSelectedEventId(event.target.value as Id<"events"> | "")
                }
                className="h-11 w-full rounded-[10px] border border-[#E1E1E1] bg-transparent px-3 text-[14px] text-[#111111] outline-none focus:border-[#111111]"
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
                className="h-11 w-full rounded-[10px] border border-[#E1E1E1] bg-transparent px-3 text-[14px] text-[#111111] outline-none placeholder:text-[#9A9A9A] focus:border-[#111111]"
                disabled={submittingAttendance}
              />

              <input
                value={attendeeEmail}
                onChange={(event) => setAttendeeEmail(event.target.value)}
                placeholder="Attendee email"
                className="h-11 w-full rounded-[10px] border border-[#E1E1E1] bg-transparent px-3 text-[14px] text-[#111111] outline-none placeholder:text-[#9A9A9A] focus:border-[#111111]"
                disabled={submittingAttendance}
              />

              <select
                value={attendeeSource}
                onChange={(event) => setAttendeeSource(event.target.value)}
                className="h-11 w-full rounded-[10px] border border-[#E1E1E1] bg-transparent px-3 text-[14px] text-[#111111] outline-none focus:border-[#111111]"
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
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-[10px] bg-[#111111] px-4 text-[13px] font-semibold text-[#FFFFFF] transition hover:bg-[#1A1A1A] disabled:cursor-not-allowed disabled:bg-[#B5B5B5]"
            >
              {submittingAttendance ? "Logging..." : "Log attendance"}
            </button>
          </form>

          <form
            onSubmit={handleInsightSubmit}
            className="rounded-[18px] border border-[#E9E9E9] bg-[#FFFFFF] p-5"
          >
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#999999]">
                Snapshot Note
              </p>
              <h3 className="text-[16px] font-semibold text-[#111111]">
                Persist the current read
              </h3>
            </div>

            <textarea
              value={insightText}
              onChange={(event) => setInsightText(event.target.value)}
              rows={5}
              placeholder="Example: Repeat attendance is clustering around workshop-format events."
              className="mt-4 w-full rounded-[10px] border border-[#E1E1E1] bg-transparent px-3 py-3 text-[14px] leading-6 text-[#111111] outline-none placeholder:text-[#9A9A9A] focus:border-[#111111]"
              disabled={submittingInsight}
            />

            <button
              type="submit"
              disabled={submittingInsight}
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-[10px] border border-[#111111] bg-[#FFFFFF] px-4 text-[13px] font-semibold text-[#111111] transition hover:bg-[#F3F3F3] disabled:cursor-not-allowed disabled:border-[#D0D0D0] disabled:text-[#9A9A9A]"
            >
              {submittingInsight ? "Saving..." : "Save insight snapshot"}
            </button>
          </form>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-[18px] border border-[#E9E9E9] bg-[#FFFFFF]">
          <div className="border-b border-[#ECECEC] px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#999999]">
              Repeat Attendees
            </p>
            <h3 className="mt-1 text-[16px] font-semibold text-[#111111]">
              People returning across events
            </h3>
          </div>

          <div className="divide-y divide-[#F0F0F0]">
            {repeatAttendees.length > 0 ? (
              repeatAttendees.map((attendee) => (
                <div
                  key={attendee.email}
                  className="flex items-center justify-between px-5 py-4"
                >
                  <div>
                    <p className="text-[14px] font-medium text-[#111111]">
                      {attendee.name ?? attendee.email}
                    </p>
                    <p className="mt-1 text-[12px] text-[#8A8A8A]">{attendee.email}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-[var(--font-outfit)] text-[28px] font-light tracking-[-0.04em] text-[#111111]">
                      {attendee.event_count}
                    </p>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-[#9A9A9A]">
                      events
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-5 py-6 text-[14px] text-[#6F6F6F]">
                Repeat attendees will appear here once the same email checks into multiple events.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[18px] border border-[#E9E9E9] bg-[#FFFFFF]">
          <div className="border-b border-[#ECECEC] px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#999999]">
              Recent Check-Ins
            </p>
            <h3 className="mt-1 text-[16px] font-semibold text-[#111111]">
              Latest attendance activity
            </h3>
          </div>

          <div className="divide-y divide-[#F0F0F0]">
            {recentAttendance.length > 0 ? (
              recentAttendance.map((entry) => (
                <div key={entry._id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[14px] font-medium text-[#111111]">
                        {entry.name ?? entry.email}
                      </p>
                      <p className="mt-1 text-[12px] text-[#8A8A8A]">
                        {entry.event_title} · {formatDate(entry.event_date)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-[#9A9A9A]">
                        {entry.source ? formatSourceLabel(entry.source) : "unknown"}
                      </p>
                      <p className="mt-1 text-[12px] text-[#666666]">
                        {formatTimestamp(entry.checked_in_at)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-5 py-6 text-[14px] text-[#6F6F6F]">
                Recent attendance will populate as soon as check-ins are recorded.
              </div>
            )}
          </div>
        </div>
      </section>
    </DashboardPageShell>
  );
}
