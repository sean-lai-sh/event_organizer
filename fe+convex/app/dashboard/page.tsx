"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { FileEdit, Users2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DashboardPageShell } from "@/components/dashboard/PageShell";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

function formatShortDate(value?: string | null) {
  if (!value) return "TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatSourceLabel(source?: string | null) {
  if (!source) return "unknown";
  return source.replace(/_/g, " ");
}

function StatWidget({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[14px] border border-[#EBEBEB] bg-white p-4">
      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#999999]">
        {label}
      </span>
      <span className="text-[28px] font-light leading-none tracking-[-0.03em] text-[#111111]">
        {value}
      </span>
      {sub ? <span className="text-[12px] text-[#999999]">{sub}</span> : null}
    </div>
  );
}

function ChartPanel({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[14px] border border-[#EBEBEB] bg-white p-5">
      <p className="text-[13px] font-semibold text-[#111111]">{title}</p>
      {sub ? <p className="mt-0.5 text-[12px] text-[#999999]">{sub}</p> : null}
      <div className="mt-4">{children}</div>
    </div>
  );
}

const chartAxisProps = {
  tick: { fontSize: 11, fill: "#999999", fontFamily: "Inter" },
  axisLine: false as const,
  tickLine: false as const,
};

const tooltipStyle = {
  contentStyle: {
    background: "#FFFFFF",
    border: "1px solid #EBEBEB",
    borderRadius: 8,
    fontSize: 12,
    color: "#111111",
    boxShadow: "none",
  },
};

const EMPTY_CHART = (
  <div className="flex h-[180px] items-center justify-center text-[13px] text-[#999999]">
    No attendance data yet
  </div>
);

export default function DashboardPage() {
  const timeSeries = useQuery(api.attendance.getAttendanceTimeSeries, {});
  const widgets = useQuery(api.attendance.getDashboardWidgets, {});
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

  const repeatAttendees = dashboard?.repeat_attendees ?? [];
  const latestInsight = dashboard?.latest_insight ?? null;

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
        attendees: [{ email: attendeeEmail, name: attendeeName || undefined, source: attendeeSource }],
      });
      setMessage(`Logged ${result.inserted_count + result.updated_count} attendee record for ${result.event_title}.`);
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
      await recordAttendanceInsight({ insight_text: insightText });
      setMessage("Saved snapshot note.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save snapshot note.");
    } finally {
      setSubmittingInsight(false);
    }
  }

  const nextEventValue = widgets?.next_event
    ? formatShortDate(widgets.next_event.event_date)
    : "—";
  const nextEventSub = widgets?.next_event
    ? widgets.next_event.title.slice(0, 24) + (widgets.next_event.title.length > 24 ? "…" : "")
    : "No upcoming events";

  const recentStatus = widgets?.recent_event?.status;
  const recentStatusValue = recentStatus
    ? recentStatus.charAt(0).toUpperCase() + recentStatus.slice(1)
    : "—";
  const recentEventSub = widgets?.recent_event
    ? widgets.recent_event.title.slice(0, 24) + (widgets.recent_event.title.length > 24 ? "…" : "")
    : "No past events";

  const hasTimeSeries = timeSeries !== undefined && timeSeries.length > 0;

  return (
    <DashboardPageShell title="Dashboard">
      {/* Row 1 — Stat widgets */}
      <section className="grid grid-cols-3 gap-3">
        {widgets === undefined ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[90px] rounded-[14px]" />
          ))
        ) : (
          <>
            <StatWidget
              label="Next Event"
              value={nextEventValue}
              sub={nextEventSub}
            />
            <StatWidget
              label="Events (6 mo)"
              value={widgets.events_past_6_months.toString()}
              sub="in the last 6 months"
            />
            <StatWidget
              label="Latest Event"
              value={recentStatusValue}
              sub={recentEventSub}
            />
          </>
        )}
      </section>

      {/* Row 2 — Side-by-side charts */}
      <section className="grid grid-cols-2 gap-4">
        <ChartPanel title="Attendance Delta" sub="Total attendees per event">
          {timeSeries === undefined ? (
            <Skeleton className="h-[180px] w-full rounded-[10px]" />
          ) : hasTimeSeries ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={timeSeries}>
                <CartesianGrid stroke="#EBEBEB" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="event_date"
                  {...chartAxisProps}
                  tickFormatter={formatShortDate}
                />
                <YAxis {...chartAxisProps} width={28} />
                <Tooltip {...tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="total_attendees"
                  stroke="#111111"
                  strokeWidth={1.5}
                  dot={{ fill: "#111111", r: 3 }}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : EMPTY_CHART}
        </ChartPanel>

        <ChartPanel title="New Attendees" sub="First-time attendees per event">
          {timeSeries === undefined ? (
            <Skeleton className="h-[180px] w-full rounded-[10px]" />
          ) : hasTimeSeries ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={timeSeries}>
                <CartesianGrid stroke="#EBEBEB" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="event_date"
                  {...chartAxisProps}
                  tickFormatter={formatShortDate}
                />
                <YAxis {...chartAxisProps} width={28} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="new_attendees" fill="#111111" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : EMPTY_CHART}
        </ChartPanel>
      </section>

      {/* Row 3 — Full-width stacked chart */}
      <section>
        <ChartPanel
          title="Attendance Mix over Time"
          sub="New vs. repeat attendees per event"
        >
          {timeSeries === undefined ? (
            <Skeleton className="h-[180px] w-full rounded-[10px]" />
          ) : hasTimeSeries ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={timeSeries}>
                <CartesianGrid stroke="#EBEBEB" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="event_date"
                  {...chartAxisProps}
                  tickFormatter={formatShortDate}
                />
                <YAxis {...chartAxisProps} width={28} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="new_attendees" stackId="a" fill="#111111" radius={[3, 3, 0, 0]} />
                <Bar dataKey="repeat_attendees" stackId="a" fill="#E0E0E0" />
              </BarChart>
            </ResponsiveContainer>
          ) : EMPTY_CHART}
        </ChartPanel>
      </section>

      {/* Row 4 — Top Attendees */}
      <section>
        <div className="rounded-[14px] border border-[#EBEBEB] bg-white">
          <div className="px-5 pb-3 pt-4">
            <p className="text-[13px] font-semibold text-[#111111]">Top Attendees</p>
            <p className="mt-0.5 text-[12px] text-[#999999]">Returning regulars</p>
          </div>
          {dashboard === undefined ? (
            <div className="space-y-2 px-5 pb-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-9 rounded-[10px]" />
              ))}
            </div>
          ) : repeatAttendees.length > 0 ? (
            <div className="divide-y divide-[#F4F4F4] px-5 pb-3">
              {repeatAttendees.slice(0, 8).map((a, i) => (
                <div key={a.email} className="flex items-center gap-3 py-2.5">
                  <span className="w-5 shrink-0 text-right font-mono text-[12px] text-[#BBBBBB]">
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate text-[13px] text-[#111111]">
                    {a.name ?? a.email.split("@")[0]}
                  </span>
                  <span className="shrink-0 text-[12px] text-[#999999]">
                    {a.event_count} events
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-5 pb-4 text-[13px] text-[#999999]">No repeat attendees yet.</p>
          )}
        </div>
      </section>

      {/* Operator Tools */}
      {message ? (
        <section className="rounded-[12px] border border-[#E6E6E6] bg-[#F8F8F8] px-4 py-3 text-[13px] text-[#444444]">
          {message}
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-2">
        <form
          onSubmit={handleAttendanceSubmit}
          className="rounded-[14px] border border-[#EBEBEB] bg-white p-5"
        >
          <div className="flex items-center gap-2">
            <Users2 className="h-4 w-4 text-[#8A8A8A]" strokeWidth={1.8} />
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#999999]">
              Manual Check-In
            </p>
          </div>
          <h3 className="mt-2 text-[15px] font-semibold text-[#111111]">Log one attendee</h3>
          <p className="mt-1.5 text-[12px] leading-5 text-[#6C6C6C]">
            Quick corrections, door updates, or one-off attendance capture.
          </p>

          <div className="mt-4 space-y-2.5">
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value as Id<"events"> | "")}
              className="h-10 w-full rounded-[8px] border border-[#E0E0E0] bg-white px-3 text-[13px] text-[#111111] outline-none transition focus:border-[#111111]"
              disabled={!events || events.length === 0 || submittingAttendance}
            >
              <option value="">Select an event</option>
              {(events ?? []).map((event) => (
                <option key={event._id} value={event._id}>{event.title}</option>
              ))}
            </select>

            <input
              value={attendeeName}
              onChange={(e) => setAttendeeName(e.target.value)}
              placeholder="Attendee name"
              className="h-10 w-full rounded-[8px] border border-[#E0E0E0] bg-white px-3 text-[13px] text-[#111111] outline-none transition placeholder:text-[#9A9A9A] focus:border-[#111111]"
              disabled={submittingAttendance}
            />

            <input
              value={attendeeEmail}
              onChange={(e) => setAttendeeEmail(e.target.value)}
              placeholder="Attendee email"
              className="h-10 w-full rounded-[8px] border border-[#E0E0E0] bg-white px-3 text-[13px] text-[#111111] outline-none transition placeholder:text-[#9A9A9A] focus:border-[#111111]"
              disabled={submittingAttendance}
            />

            <select
              value={attendeeSource}
              onChange={(e) => setAttendeeSource(e.target.value)}
              className="h-10 w-full rounded-[8px] border border-[#E0E0E0] bg-white px-3 text-[13px] text-[#111111] outline-none transition focus:border-[#111111]"
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
            className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-[8px] bg-[#111111] px-4 text-[12px] font-semibold text-white transition hover:bg-[#1A1A1A] disabled:cursor-not-allowed disabled:bg-[#B5B5B5]"
          >
            {submittingAttendance ? "Logging..." : "Log attendance"}
          </button>
        </form>

        <form
          onSubmit={handleInsightSubmit}
          className="rounded-[14px] border border-[#EBEBEB] bg-white p-5"
        >
          <div className="flex items-center gap-2">
            <FileEdit className="h-4 w-4 text-[#8A8A8A]" strokeWidth={1.8} />
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#999999]">
              Snapshot Note
            </p>
          </div>
          <h3 className="mt-2 text-[15px] font-semibold text-[#111111]">Save the latest narrative</h3>
          <p className="mt-1.5 text-[12px] leading-5 text-[#6C6C6C]">
            Write the clean takeaway after reading turnout, source mix, and recent activity.
          </p>

          <textarea
            value={insightText}
            onChange={(e) => setInsightText(e.target.value)}
            rows={7}
            placeholder={latestInsight?.insight_text ?? "Write the latest attendance read..."}
            className="mt-4 w-full rounded-[8px] border border-[#E0E0E0] bg-white px-3 py-3 text-[13px] leading-6 text-[#111111] outline-none transition placeholder:text-[#9A9A9A] focus:border-[#111111]"
            disabled={submittingInsight}
          />

          <button
            type="submit"
            disabled={submittingInsight}
            className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-[8px] border border-[#111111] bg-white px-4 text-[12px] font-semibold text-[#111111] transition hover:bg-[#F3F3F3] disabled:cursor-not-allowed disabled:border-[#D0D0D0] disabled:text-[#9A9A9A]"
          >
            {submittingInsight ? "Saving..." : "Save snapshot note"}
          </button>
        </form>
      </section>
    </DashboardPageShell>
  );
}
