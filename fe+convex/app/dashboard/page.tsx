"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Activity, Clock3, FileEdit, Users2 } from "lucide-react";
import { DashboardPageShell } from "@/components/dashboard/PageShell";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

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

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatRelativeCheckIns(count: number) {
  return `${count} event${count === 1 ? "" : "s"} attended`;
}

function SourceMixBar({
  label,
  count,
  maxCount,
}: {
  label: string;
  count: number;
  maxCount: number;
}) {
  const width = maxCount > 0 ? `${Math.max((count / maxCount) * 100, 6)}%` : "0%";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[13px]">
        <span className="capitalize text-[#202020]">{label}</span>
        <span className="text-[#727272]">{count}</span>
      </div>
      <div className="h-2 rounded-full bg-[#ECECEC]">
        <div className="h-2 rounded-full bg-[#111111]" style={{ width }} />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  compact = false,
}: {
  label: string;
  value: string | number;
  hint: string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-[22px] border border-[#E6E6E6] bg-[#FFFFFF] p-6">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9A9A9A]">
        {label}
      </p>
      <p
        className={`mt-3 tracking-[-0.06em] text-[#111111] ${
          compact ? "text-[24px] font-semibold leading-tight" : "font-light text-[38px] leading-none"
        }`}
      >
        {value}
      </p>
      <p className="mt-3 max-w-[18rem] text-[12px] leading-5 text-[#777777]">{hint}</p>
    </div>
  );
}

function EmptyModule({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[220px] items-center justify-center px-6 py-8">
      <div className="max-w-[380px] text-center">
        <h3 className="text-[16px] font-semibold text-[#151515]">{title}</h3>
        <p className="mt-2 text-[13px] leading-6 text-[#747474]">{description}</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const dashboard = useQuery(api.attendance.getAttendanceDashboard, {});
  const events = useQuery(api.events.listEvents, {});
  const upsertAttendanceBatch = useMutation(api.attendance.upsertAttendanceBatch);
  const recordAttendanceInsight = useMutation(api.attendance.recordAttendanceInsight);

  const [selectedEventId, setSelectedEventId] = useState<Id<"events"> | "">("");
  const [attendeeName, setAttendeeName] = useState("");
  const [attendeeEmail, setAttendeeEmail] = useState("");
  const [attendeeSource, setAttendeeSource] = useState("manual");
  const [insightText, setInsightText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submittingAttendance, setSubmittingAttendance] = useState(false);
  const [submittingInsight, setSubmittingInsight] = useState(false);

  const totals = dashboard?.totals ?? {
    events_tracked: 0,
    unique_attendees: 0,
    total_check_ins: 0,
    latest_check_in_at: null,
    by_source: {},
  };

  const latestInsight = dashboard?.latest_insight ?? null;
  const eventBreakdown = dashboard?.event_breakdown ?? [];
  const repeatAttendees = dashboard?.repeat_attendees ?? [];
  const recentAttendance = dashboard?.recent_attendance ?? [];

  const sourceEntries = useMemo(
    () => Object.entries(totals.by_source).sort((a, b) => b[1] - a[1]),
    [totals.by_source]
  );
  const maxSourceCount = sourceEntries[0]?.[1] ?? 0;

  const narrativeText =
    latestInsight?.insight_text ??
    (totals.total_check_ins > 0
      ? `Attendance is now recorded across ${totals.events_tracked} events and ${totals.unique_attendees} unique attendees. The strongest signal right now is coming from ${sourceEntries[0] ? formatSourceLabel(sourceEntries[0][0]) : "current check-ins"}, while repeat attendance is starting to show who keeps coming back.`
      : "No attendance insight has been recorded yet. Once data is added, this panel becomes the quick readout for turnout, source quality, and returner behavior.");

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
      title="Data Insights"
      action={
        <div className="rounded-[12px] border border-[#E8E8E8] bg-[#F7F7F7] px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9A9A9A]">
            Latest Snapshot
          </p>
          <p className="mt-1 text-[12px] font-medium text-[#111111]">
            {latestInsight
              ? formatCompactTimestamp(latestInsight.generated_at)
              : formatCompactTimestamp(totals.latest_check_in_at)}
          </p>
        </div>
      }
    >
      <section className="rounded-[30px] border border-[#E8E8E8] bg-[#FCFCFC] px-8 py-8">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8F8F8F]">
              Attendance Intelligence
            </p>
            <h2 className="max-w-[860px] text-[50px] font-semibold leading-[0.97] tracking-[-0.055em] text-[#111111] xl:text-[56px]">
              See the story behind turnout before you touch the ledger.
            </h2>
            <p className="max-w-[760px] text-[16px] leading-8 text-[#616161]">
              This page is tuned for quick readouts first: event momentum, repeat
              attendance, source quality, and the latest signal worth sharing with the
              team.
            </p>
          </div>

          <div className="rounded-[24px] border border-[#ECECEC] bg-[#FFFFFF] p-5">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-[#8B8B8B]" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#979797]">
                Source Mix
              </p>
            </div>
            <div className="mt-5 space-y-4">
              {sourceEntries.length > 0 ? (
                sourceEntries.slice(0, 3).map(([source, count]) => (
                  <SourceMixBar
                    key={source}
                    label={formatSourceLabel(source)}
                    count={count}
                    maxCount={maxSourceCount}
                  />
                ))
              ) : (
                <p className="text-[13px] leading-6 text-[#666666]">
                  No source data has been recorded yet.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Tracked Events"
            value={totals.events_tracked}
            hint="events with at least one recorded attendee"
          />
          <StatCard
            label="Unique Attendees"
            value={totals.unique_attendees}
            hint="deduped across the full attendance history"
          />
          <StatCard
            label="Total Check-Ins"
            value={totals.total_check_ins}
            hint="all event attendance rows now in the system"
          />
          <StatCard
            label="Latest Activity"
            value={formatCompactTimestamp(totals.latest_check_in_at)}
            hint="most recent attendance captured in Convex"
            compact
          />
        </div>
      </section>

      <section className="rounded-[24px] border border-[#151515] bg-[#111111] px-6 py-6 text-[#FFFFFF]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#BEBEBE]">
          Current Attendance Read
        </p>
        <p className="mt-3 max-w-[1040px] text-[15px] leading-7 text-[#F2F2F2]">
          {narrativeText}
        </p>
      </section>

      <section className="rounded-[22px] border border-[#ECECEC] bg-[#FFFFFF] px-6 py-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#A0A0A0]">
              Data Details Below
            </p>
            <h3 className="mt-2 text-[22px] font-semibold tracking-[-0.04em] text-[#111111]">
              Dive into records and operations after the top-line read
            </h3>
          </div>
          <p className="max-w-[520px] text-[13px] leading-6 text-[#6E6E6E]">
            The sections below move from detailed event breakdowns into attendee behavior,
            recent activity, and the manual tools used to maintain the dataset.
          </p>
        </div>
      </section>

      {message ? (
        <section className="rounded-[16px] border border-[#E6E6E6] bg-[#F8F8F8] px-4 py-3 text-[13px] text-[#444444]">
          {message}
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <section className="flex h-[560px] flex-col overflow-hidden rounded-[24px] border border-[#E6E6E6] bg-[#FFFFFF]">
            <div className="border-b border-[#EFEFEF] px-6 py-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9F9F9F]">
                Distribution
              </p>
              <h3 className="mt-2 text-[24px] font-semibold tracking-[-0.045em] text-[#111111]">
                Attendance by event
              </h3>
              <p className="mt-2 text-[14px] leading-6 text-[#6C6C6C]">
                Event-by-event turnout with recency and source mix visible in one scan.
              </p>
            </div>

            {dashboard === undefined ? (
              <div className="space-y-3 px-5 py-5">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-[72px] animate-pulse rounded-[14px] border border-[#EFEFEF] bg-[#F7F7F7]"
                  />
                ))}
              </div>
            ) : eventBreakdown.length > 0 ? (
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full min-w-[880px]">
                  <thead>
                    <tr className="border-b border-[#F0F0F0] bg-[#FAFAFA]">
                      {["Event", "Date", "Attendees", "Last Check-In", "Source Mix"].map(
                        (heading) => (
                          <th
                            key={heading}
                            className="sticky top-0 z-10 bg-[#FAFAFA] px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-[#A0A0A0]"
                          >
                            {heading}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F1F1]">
                    {eventBreakdown.map((event) => (
                      <tr key={event.event_id} className="transition hover:bg-[#FCFCFC]">
                        <td className="px-6 py-4">
                          <p className="text-[14px] font-medium text-[#111111]">{event.title}</p>
                          <p className="mt-1 text-[12px] text-[#8A8A8A]">
                            {Object.entries(event.sources)
                              .slice(0, 2)
                              .map(([source, count]) => `${formatSourceLabel(source)} ${count}`)
                              .join(" / ") || "No source data"}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-[13px] text-[#5E5E5E]">
                          {formatShortDate(event.event_date)}
                        </td>
                        <td className="px-6 py-4 text-[34px] font-light tracking-[-0.06em] text-[#111111]">
                          {event.attendee_count}
                        </td>
                        <td className="px-6 py-4 text-[13px] text-[#5E5E5E]">
                          {formatCompactTimestamp(event.latest_check_in_at)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(event.sources).length > 0 ? (
                              Object.entries(event.sources)
                                .slice(0, 2)
                                .map(([source, count]) => (
                                  <span
                                    key={source}
                                    className="rounded-full border border-[#E1E1E1] bg-[#F7F7F7] px-2.5 py-1 text-[11px] font-medium text-[#585858]"
                                  >
                                    {formatSourceLabel(source)} {count}
                                  </span>
                                ))
                            ) : (
                              <span className="text-[12px] text-[#8A8A8A]">No sources yet</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyModule
                title="No attendance records yet"
                description="Once events have check-ins, this module will show turnout and source mix by event."
              />
            )}
          </section>

          <section className="grid gap-5 xl:grid-cols-2">
            <div className="flex h-[680px] flex-col overflow-hidden rounded-[22px] border border-[#E8E8E8] bg-[#FFFFFF]">
              <div className="border-b border-[#EFEFEF] px-5 py-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9F9F9F]">
                  Behavior
                </p>
                <h3 className="mt-2 text-[22px] font-semibold tracking-[-0.04em] text-[#111111]">
                  Repeat attendees
                </h3>
                <p className="mt-2 text-[13px] leading-6 text-[#6C6C6C]">
                  The people most likely to return and the names worth calling out in updates.
                </p>
              </div>

              {dashboard === undefined ? (
                <div className="space-y-3 px-5 py-5">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-[78px] animate-pulse rounded-[14px] border border-[#EFEFEF] bg-[#F7F7F7]"
                    />
                  ))}
                </div>
              ) : repeatAttendees.length > 0 ? (
                <div className="flex min-h-0 flex-1 flex-col p-5">
                  {repeatAttendees[0] ? (
                    <div className="rounded-[20px] border border-[#E4E4E4] bg-[linear-gradient(180deg,#FCFCFC_0%,#F8F8F8_100%)] p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-4">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#DCDCDC] bg-[#111111] text-[13px] font-semibold tracking-[0.06em] text-[#FFFFFF]">
                            {getInitials(repeatAttendees[0].name ?? repeatAttendees[0].email)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[16px] font-semibold tracking-[-0.03em] text-[#111111]">
                              {repeatAttendees[0].name ?? repeatAttendees[0].email}
                            </p>
                            <span className="mt-2 inline-flex rounded-full border border-[#DDDDDD] bg-[#FFFFFF] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#666666]">
                              Strongest returner
                            </span>
                            <p className="mt-3 text-[13px] font-medium text-[#5D5D5D]">
                              Highest repeat attendance
                            </p>
                            <p className="mt-1 text-[12px] text-[#8A8A8A]">
                              {repeatAttendees[0].email}
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="inline-flex rounded-full border border-[#D8D8D8] bg-[#FFFFFF] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#666666]">
                            {repeatAttendees[0].event_count}x
                          </span>
                          <p className="mt-2 text-[12px] text-[#666666]">
                            {formatRelativeCheckIns(repeatAttendees[0].event_count)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {repeatAttendees.slice(1, 5).length > 0 ? (
                    <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-2">
                      <div className="space-y-2 pb-1">
                      {repeatAttendees.slice(1).map((attendee) => (
                        <div
                          key={attendee.email}
                          className="flex items-center justify-between gap-3 rounded-[16px] border border-[#F0F0F0] bg-[#FCFCFC] px-4 py-3"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E4E4E4] bg-[#FFFFFF] text-[11px] font-semibold text-[#676767]">
                              {getInitials(attendee.name ?? attendee.email)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-[14px] font-medium text-[#111111]">
                                {attendee.name ?? attendee.email}
                              </p>
                              <p className="truncate text-[12px] text-[#858585]">{attendee.email}</p>
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <span className="inline-flex rounded-full border border-[#DFDFDF] bg-[#FFFFFF] px-2.5 py-1 text-[11px] font-semibold text-[#555555]">
                              {attendee.event_count}x
                            </span>
                            <p className="mt-1 text-[11px] text-[#919191]">
                              {formatRelativeCheckIns(attendee.event_count)}
                            </p>
                          </div>
                        </div>
                      ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <EmptyModule
                  title="No repeat attendance yet"
                  description="As attendees return across events, this list will surface the strongest repeaters."
                />
              )}
            </div>

            <div className="flex h-[680px] flex-col overflow-hidden rounded-[22px] border border-[#E8E8E8] bg-[#FFFFFF]">
              <div className="border-b border-[#EFEFEF] px-5 py-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9F9F9F]">
                  Activity
                </p>
                <h3 className="mt-2 text-[22px] font-semibold tracking-[-0.04em] text-[#111111]">
                  Recent check-ins
                </h3>
                <p className="mt-2 text-[13px] leading-6 text-[#6C6C6C]">
                  The freshest attendance movement across events so the dataset always feels current.
                </p>
              </div>

              {dashboard === undefined ? (
                <div className="space-y-3 px-5 py-5">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-[82px] animate-pulse rounded-[14px] border border-[#EFEFEF] bg-[#F7F7F7]"
                    />
                  ))}
                </div>
              ) : recentAttendance.length > 0 ? (
                <div className="flex min-h-0 flex-1 flex-col p-5">
                  {recentAttendance[0] ? (
                    <div className="rounded-[20px] border border-[#E4E4E4] bg-[linear-gradient(180deg,#FCFCFC_0%,#F8F8F8_100%)] p-5">
                      <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#DCDCDC] bg-[#111111]">
                          <Clock3 className="h-4 w-4 text-[#FFFFFF]" strokeWidth={1.8} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[16px] font-semibold text-[#111111]">
                              {recentAttendance[0].name ?? recentAttendance[0].email}
                            </p>
                            <span className="rounded-full border border-[#DDDDDD] bg-[#FFFFFF] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#666666]">
                              Latest check-in
                            </span>
                          </div>
                          <p className="mt-1 text-[13px] font-medium text-[#5D5D5D]">
                            {recentAttendance[0].event_title}
                          </p>
                          <p className="mt-1 text-[12px] text-[#8A8A8A]">
                            {formatShortDate(recentAttendance[0].event_date)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="inline-flex rounded-full border border-[#D8D8D8] bg-[#FFFFFF] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#666666]">
                            {formatSourceLabel(recentAttendance[0].source)}
                          </span>
                          <p className="mt-2 text-[12px] text-[#666666]">
                            {formatCompactTimestamp(recentAttendance[0].checked_in_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {recentAttendance.slice(1, 5).length > 0 ? (
                    <div className="relative mt-4 min-h-0 flex-1 overflow-y-auto pr-2">
                      <div className="absolute bottom-2 left-[15px] top-2 w-px bg-[#E8E8E8]" />
                      <div className="space-y-3 pb-1 pl-6">
                        {recentAttendance.slice(1).map((entry) => (
                          <div key={entry._id} className="relative flex items-start gap-3">
                            <div className="absolute left-[-17px] top-3 h-2.5 w-2.5 rounded-full border border-[#D8D8D8] bg-[#FFFFFF]" />
                            <div className="flex-1 rounded-[16px] border border-[#F0F0F0] bg-[#FCFCFC] px-4 py-3">
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <p className="text-[14px] font-medium text-[#111111]">
                                    {entry.name ?? entry.email}
                                  </p>
                                  <p className="mt-1 text-[12px] font-medium text-[#666666]">
                                    {entry.event_title}
                                  </p>
                                  <p className="mt-1 text-[12px] text-[#8A8A8A]">
                                    {formatShortDate(entry.event_date)}
                                  </p>
                                </div>
                                <div className="shrink-0 text-right">
                                  <span className="inline-flex rounded-full border border-[#E0E0E0] bg-[#FFFFFF] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#6D6D6D]">
                                    {formatSourceLabel(entry.source)}
                                  </span>
                                  <p className="mt-2 text-[11px] text-[#7A7A7A]">
                                    {formatCompactTimestamp(entry.checked_in_at)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <EmptyModule
                  title="No recent activity"
                  description="Once attendance is recorded, this panel will show the freshest event movement."
                />
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-[16px] border border-[#ECECEC] bg-[#F8F8F8] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9A9A9A]">
              Operator Tools
            </p>
            <p className="mt-2 text-[12px] leading-5 text-[#727272]">
              Logging and note-taking live here so the dashboard stays insight-first.
            </p>
          </div>
          <form
            onSubmit={handleAttendanceSubmit}
            className="rounded-[20px] border border-[#ECECEC] bg-[#FAFAFA] p-4"
          >
            <div className="flex items-center gap-2">
              <Users2 className="h-4 w-4 text-[#8A8A8A]" strokeWidth={1.8} />
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#999999]">
                Manual Check-In
              </p>
            </div>
            <h3 className="mt-2.5 text-[15px] font-semibold text-[#111111]">Log one attendee</h3>
            <p className="mt-2 text-[12px] leading-5 text-[#6C6C6C]">
              Use this for quick corrections, door updates, or one-off attendance capture.
            </p>

            <div className="mt-4 space-y-2.5">
              <select
                value={selectedEventId}
                onChange={(event) => setSelectedEventId(event.target.value as Id<"events"> | "")}
                className="h-10 w-full rounded-[12px] border border-[#E2E2E2] bg-[#FFFFFF] px-3 text-[13px] text-[#111111] outline-none transition focus:border-[#111111]"
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
                className="h-10 w-full rounded-[12px] border border-[#E2E2E2] bg-[#FFFFFF] px-3 text-[13px] text-[#111111] outline-none transition placeholder:text-[#9A9A9A] focus:border-[#111111]"
                disabled={submittingAttendance}
              />

              <input
                value={attendeeEmail}
                onChange={(event) => setAttendeeEmail(event.target.value)}
                placeholder="Attendee email"
                className="h-10 w-full rounded-[12px] border border-[#E2E2E2] bg-[#FFFFFF] px-3 text-[13px] text-[#111111] outline-none transition placeholder:text-[#9A9A9A] focus:border-[#111111]"
                disabled={submittingAttendance}
              />

              <select
                value={attendeeSource}
                onChange={(event) => setAttendeeSource(event.target.value)}
                className="h-10 w-full rounded-[12px] border border-[#E2E2E2] bg-[#FFFFFF] px-3 text-[13px] text-[#111111] outline-none transition focus:border-[#111111]"
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
              className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-[12px] bg-[#111111] px-4 text-[12px] font-semibold text-[#FFFFFF] transition hover:bg-[#1A1A1A] disabled:cursor-not-allowed disabled:bg-[#B5B5B5]"
            >
              {submittingAttendance ? "Logging..." : "Log attendance"}
            </button>
          </form>

          <form
            onSubmit={handleInsightSubmit}
            className="rounded-[20px] border border-[#ECECEC] bg-[#FAFAFA] p-4"
          >
            <div className="flex items-center gap-2">
              <FileEdit className="h-4 w-4 text-[#8A8A8A]" strokeWidth={1.8} />
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#999999]">
                Snapshot Note
              </p>
            </div>
            <h3 className="mt-2.5 text-[15px] font-semibold text-[#111111]">
              Save the latest narrative
            </h3>
            <p className="mt-2 text-[12px] leading-5 text-[#6C6C6C]">
              Write the clean takeaway after reading turnout, source mix, and recent activity.
            </p>

            <textarea
              value={insightText}
              onChange={(event) => setInsightText(event.target.value)}
              rows={8}
              placeholder={latestInsight?.insight_text ?? "Write the latest attendance read..."}
              className="mt-4 w-full rounded-[12px] border border-[#E2E2E2] bg-[#FFFFFF] px-3 py-3 text-[13px] leading-6 text-[#111111] outline-none transition placeholder:text-[#9A9A9A] focus:border-[#111111]"
              disabled={submittingInsight}
            />

            <button
              type="submit"
              disabled={submittingInsight}
              className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-[12px] border border-[#111111] bg-[#FFFFFF] px-4 text-[12px] font-semibold text-[#111111] transition hover:bg-[#F3F3F3] disabled:cursor-not-allowed disabled:border-[#D0D0D0] disabled:text-[#9A9A9A]"
            >
              {submittingInsight ? "Saving..." : "Save snapshot note"}
            </button>
          </form>
        </aside>
      </section>
    </DashboardPageShell>
  );
}
