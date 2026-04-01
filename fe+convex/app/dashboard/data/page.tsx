"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { DashboardPageShell } from "@/components/dashboard/PageShell";
import { AttendanceImport } from "@/components/dashboard/AttendanceImport";
import { AttendanceDemoSeed } from "@/components/dashboard/AttendanceDemoSeed";
import { AttendanceTrendChart } from "@/components/dashboard/AttendanceTrendChart";
import { AttendeeProfileList } from "@/components/dashboard/AttendeeProfileList";
import { InsightCard } from "@/components/dashboard/InsightCard";
import { Skeleton } from "@/components/ui/skeleton";

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

export default function DataPage() {
  const trends = useQuery(api.attendance.getAttendanceTrends);
  const profiles = useQuery(api.attendance.getAttendeeProfiles, {});
  const stats = useQuery(api.attendance.getAttendanceStats);
  const insight = useQuery(api.attendance.getLatestInsight);
  const showDemoSeed = process.env.NODE_ENV !== "production";

  const hasLoaded =
    trends !== undefined && profiles !== undefined && stats !== undefined && insight !== undefined;
  const hasData = hasLoaded && (stats?.total_events_tracked ?? 0) > 0;

  return (
    <DashboardPageShell
      title="Data"
      action={<AttendanceImport />}
    >
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
              No attendance data yet
            </p>
            <p className="mt-2 text-[13px] leading-[1.6] text-[#999999]">
              Import a CSV for any event to unlock trends, attendee profiles, and AI-generated insights.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <AttendanceImport triggerLabel="Import attendance" />
              {showDemoSeed ? (
                <AttendanceDemoSeed triggerLabel="Load demo attendance" triggerVariant="outline" />
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <>
          {trends === undefined || insight === undefined ? (
            <MainGridSkeleton />
          ) : (
            <section className="grid gap-4 xl:grid-cols-[1fr_340px]">
              <AttendanceTrendChart data={trends} />
              <InsightCard insight={insight} hasData={hasData} />
            </section>
          )}

          {profiles === undefined ? <ProfileListSkeleton /> : <AttendeeProfileList profiles={profiles} />}
        </>
      )}
    </DashboardPageShell>
  );
}
