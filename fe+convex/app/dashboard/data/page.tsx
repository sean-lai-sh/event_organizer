"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DashboardPageShell } from "@/components/dashboard/PageShell";
import { AttendanceImport } from "@/components/dashboard/AttendanceImport";
import { AttendanceDemoSeed } from "@/components/dashboard/AttendanceDemoSeed";
import { AttendanceTrendChart } from "@/components/dashboard/AttendanceTrendChart";
import { AttendeeProfileList } from "@/components/dashboard/AttendeeProfileList";
import { InsightCard, type Insight } from "@/components/dashboard/InsightCard";
import { Skeleton } from "@/components/ui/skeleton";

export type DashboardEventOption = {
  _id: string;
  title: string;
};

export type DashboardAttendanceStats = {
  total_events_tracked: number;
  total_unique_attendees: number;
  avg_attendance: number;
  top_event: { title: string; count: number } | null;
};

export type DashboardAttendanceTrend = {
  event_id: string;
  title: string;
  event_date: string;
  event_type: string;
  attendee_count: number;
};

export type DashboardAttendeeProfile = {
  email: string;
  name: string | null;
  events_attended: number;
  first_seen: string;
  last_seen: string;
  event_types: string[];
  streak: number;
  is_active: boolean;
  interest_prediction: {
    primary_type: string;
    type_distribution: Record<string, number>;
    confidence: "low" | "medium" | "high";
  } | null;
};

type DashboardDataPageBodyProps = {
  events: DashboardEventOption[] | undefined;
  selectedEventId: string;
  onSelectedEventChange: (value: string) => void;
  stats: DashboardAttendanceStats | undefined;
  trends: DashboardAttendanceTrend[] | undefined;
  profiles: DashboardAttendeeProfile[] | undefined;
  insight: Insight | null | undefined;
  importAction: ReactNode;
  demoSeedAction?: ReactNode;
  isGeneratingInsight: boolean;
  insightError: string | null;
  onGenerateInsight: () => void;
  chartContent?: ReactNode;
  profileContent?: ReactNode;
};

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-[18px] border border-[#e8e8e8] bg-[#f4f4f4] p-4">
      <span className="font-[var(--font-outfit)] text-[34px] font-light leading-none tracking-[-0.04em] text-[#1f1f1f]">
        {value}
      </span>
      <span className="text-[13px] font-medium text-[#767676]">{label}</span>
    </div>
  );
}

function KpiSkeletonRow() {
  return (
    <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="flex flex-col gap-2 rounded-[18px] border border-[#e8e8e8] bg-[#f4f4f4] p-4"
        >
          <Skeleton className="h-9 w-20 rounded-[10px] bg-[#E7E7E7]" />
          <Skeleton className="h-4 w-28 rounded-[8px] bg-[#E7E7E7]" />
        </div>
      ))}
    </section>
  );
}

function MainGridSkeleton() {
  return (
    <section className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <div className="rounded-[14px] border border-[#EBEBEB] bg-white p-5">
        <Skeleton className="h-4 w-40 bg-[#EFEFEF]" />
        <Skeleton className="mt-4 h-[280px] w-full bg-[#F5F5F5]" />
      </div>
      <div className="rounded-[14px] border border-[#EBEBEB] bg-white p-4">
        <Skeleton className="h-4 w-24 bg-[#EFEFEF]" />
        <Skeleton className="mt-4 h-20 w-full bg-[#F5F5F5]" />
        <Skeleton className="mt-3 h-4 w-2/3 bg-[#F0F0F0]" />
      </div>
    </section>
  );
}

function ProfileListSkeleton() {
  return (
    <div className="rounded-[14px] border border-[#EBEBEB] bg-white p-5">
      <Skeleton className="h-4 w-36 bg-[#EFEFEF]" />
      <Skeleton className="mt-2 h-4 w-64 bg-[#F2F2F2]" />
      <Skeleton className="mt-6 h-56 w-full bg-[#F6F6F6]" />
    </div>
  );
}

export function DashboardDataPageBody({
  events,
  selectedEventId,
  onSelectedEventChange,
  stats,
  trends,
  profiles,
  insight,
  importAction,
  demoSeedAction,
  isGeneratingInsight,
  insightError,
  onGenerateInsight,
  chartContent,
  profileContent,
}: DashboardDataPageBodyProps) {
  const selectedEvent = events?.find((event) => event._id === selectedEventId) ?? null;
  const hasLoaded =
    events !== undefined &&
    trends !== undefined &&
    profiles !== undefined &&
    stats !== undefined &&
    insight !== undefined;
  const hasData = hasLoaded && (stats?.total_events_tracked ?? 0) > 0;
  const isEventScoped = Boolean(selectedEventId);
  const emptyTitle = selectedEvent
    ? `No attendance recorded for ${selectedEvent.title} yet`
    : "No attendance data yet";
  const emptyDescription = selectedEvent
    ? "Import a CSV for this event to populate attendance, attendee profiles, and event-specific insights."
    : "Import a CSV for any event to unlock trends, attendee profiles, and deterministic insights.";

  return (
    <>
      <section className="rounded-[14px] border border-[#EBEBEB] bg-white p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.07em] text-[#999999]">
              Scope
            </p>
            <p className="mt-1 text-[13px] text-[#666666]">
              Switch between all events and a single event to inspect attendance and insight states.
            </p>
          </div>
          <label className="grid gap-2 xl:min-w-[280px]">
            <span className="text-[12px] font-medium text-[#555555]">Attendance view</span>
            <select
              value={selectedEventId}
              onChange={(event) => onSelectedEventChange(event.target.value)}
              className="h-11 rounded-[8px] border border-[#E0E0E0] bg-white px-3 text-[13px] text-[#111111] outline-none focus:border-[#C8C8C8]"
            >
              <option value="">All events</option>
              {(events ?? []).map((event) => (
                <option key={event._id} value={event._id}>
                  {event.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {stats === undefined ? (
        <KpiSkeletonRow />
      ) : hasData ? (
        <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <KpiCard label="total events" value={String(stats.total_events_tracked)} />
          <KpiCard label="unique attendees" value={String(stats.total_unique_attendees)} />
          <KpiCard label="avg attendance" value={String(stats.avg_attendance)} />
          <KpiCard
            label={stats.top_event ? `top event · ${stats.top_event.title}` : "top event"}
            value={stats.top_event ? String(stats.top_event.count) : "—"}
          />
        </section>
      ) : null}

      {!hasLoaded ? (
        <>
          <MainGridSkeleton />
          <ProfileListSkeleton />
        </>
      ) : !hasData ? (
        <div className="flex min-h-[420px] items-center justify-center rounded-[18px] border border-[#E8E8E8] bg-[#F7F7F7] px-6 text-center">
          <div className="max-w-md">
            <p className="text-[20px] font-semibold tracking-[-0.02em] text-[#111111]">
              {emptyTitle}
            </p>
            <p className="mt-2 text-[13px] leading-[1.6] text-[#999999]">{emptyDescription}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {importAction}
              {!isEventScoped && demoSeedAction ? demoSeedAction : null}
            </div>
          </div>
        </div>
      ) : (
        <>
          {trends === undefined || insight === undefined ? (
            <MainGridSkeleton />
          ) : (
            <section className="grid gap-4 xl:grid-cols-[1fr_340px]">
              {chartContent ?? <AttendanceTrendChart data={trends} />}
              <InsightCard
                insight={insight}
                hasData={hasData}
                selectedEventName={selectedEvent?.title ?? null}
                isGenerating={isGeneratingInsight}
                errorMessage={insightError}
                onGenerate={onGenerateInsight}
              />
            </section>
          )}

          {profiles === undefined ? (
            <ProfileListSkeleton />
          ) : (
            profileContent ?? <AttendeeProfileList profiles={profiles} />
          )}
        </>
      )}
    </>
  );
}

export default function DataPage() {
  const [selectedEventId, setSelectedEventId] = useState("");
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);

  const scopedEventId = selectedEventId ? (selectedEventId as Id<"events">) : undefined;
  const events = useQuery(api.events.listEvents, {});
  const trends = useQuery(api.attendance.getAttendanceTrends, { event_id: scopedEventId });
  const profiles = useQuery(api.attendance.getAttendeeProfiles, {
    event_id: scopedEventId,
    min_events: 0,
  });
  const stats = useQuery(api.attendance.getAttendanceStats, { event_id: scopedEventId });
  const insight = useQuery(api.attendance.getLatestInsight, { event_id: scopedEventId });
  const refreshInsight = useMutation(api.attendance.refreshInsight);

  const selectedEventName = useMemo(
    () => events?.find((event) => event._id === selectedEventId)?.title ?? null,
    [events, selectedEventId]
  );

  async function handleGenerateInsight() {
    if (!stats || stats.total_events_tracked === 0) {
      return;
    }

    try {
      setIsGeneratingInsight(true);
      setInsightError(null);
      await refreshInsight({ event_id: scopedEventId });
      const action = insight ? "Refreshed" : "Generated";
      const scopeLabel = selectedEventName ?? "all events";
      toast.success(`${action} insight for ${scopeLabel}.`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to generate insight for this scope";
      setInsightError(message);
      toast.error(message);
    } finally {
      setIsGeneratingInsight(false);
    }
  }

  return (
    <DashboardPageShell title="Data" action={<AttendanceImport />}>
      <DashboardDataPageBody
        events={events}
        selectedEventId={selectedEventId}
        onSelectedEventChange={(value) => {
          setSelectedEventId(value);
          setInsightError(null);
        }}
        stats={stats}
        trends={trends}
        profiles={profiles}
        insight={insight}
        importAction={<AttendanceImport triggerLabel="Import attendance" />}
        demoSeedAction={
          process.env.NODE_ENV !== "production" ? (
            <AttendanceDemoSeed triggerLabel="Load demo attendance" triggerVariant="outline" />
          ) : undefined
        }
        isGeneratingInsight={isGeneratingInsight}
        insightError={insightError}
        onGenerateInsight={handleGenerateInsight}
      />
    </DashboardPageShell>
  );
}
