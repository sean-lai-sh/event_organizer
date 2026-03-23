"use client";

import Link from "next/link";
import { useMemo } from "react";
import { DashboardPageShell } from "@/components/dashboard/PageShell";

const useEvents = () => {
  return [
    {
      _id: "1",
      title: "AI & Society Speaker Panel",
      event_date: "2026-03-28",
      type: "Speaker Panel",
      status: "Outreach",
    },
    {
      _id: "2",
      title: "Web3 & Startups Workshop",
      event_date: "2026-04-05",
      type: "Workshop",
      status: "Matching",
    },
    {
      _id: "3",
      title: "Spring Networking Mixer",
      event_date: "2026-04-18",
      type: "Networking",
      status: "Completed",
    },
  ];
};

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-[14px] border border-[#EBEBEB] bg-[#FFFFFF] px-4 py-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#999999]">{label}</p>
      <p className="mt-2 font-mono text-[28px] font-semibold leading-none text-[#111111]">{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const events = useEvents();
  const eventRows = useMemo(() => events.slice(0, 3), [events]);

  return (
    <DashboardPageShell
      title="Dashboard"
      action={
        <Link
          href="/dashboard/events/new"
          className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-[#E0E0E0] bg-[#FFFFFF] px-4 text-[13px] font-medium text-[#111111] transition hover:bg-[#F4F4F4]"
        >
          <span className="text-[16px] leading-none">+</span>
          <span>New event</span>
        </Link>
      }
    >
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total Events" value={24} />
        <MetricCard label="Active Outreach" value={8} />
        <MetricCard label="Accepted Speakers" value={12} />
        <MetricCard label="Upcoming" value={5} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-semibold text-[#111111]">Recent Events</h2>
            <Link href="/dashboard/events" className="text-[13px] font-medium text-[#555555] hover:text-[#111111]">
              View all
            </Link>
          </div>

          <div className="overflow-hidden rounded-[14px] border border-[#EBEBEB] bg-[#FFFFFF]">
            <div className="grid h-10 grid-cols-[1.5fr_1fr_1fr_0.9fr] items-center bg-[#F4F4F4] px-4 text-[11px] font-semibold tracking-[0.04em] text-[#6B6B6B]">
              <span>EVENT</span>
              <span>TYPE</span>
              <span>DATE</span>
              <span>STATUS</span>
            </div>
            {eventRows.map((event, index) => (
              <div
                key={event._id}
                className={`grid h-12 grid-cols-[1.5fr_1fr_1fr_0.9fr] items-center px-4 text-[13px] ${
                  index < eventRows.length - 1 ? "border-b border-[#EBEBEB]" : ""
                }`}
              >
                <span className="truncate text-[#111111]">{event.title}</span>
                <span className="text-[#555555]">{event.type}</span>
                <span className="text-[#6B6B6B]">
                  {new Date(event.event_date).toLocaleDateString()}
                </span>
                <span className="font-medium text-[#3B3B3B]">{event.status}</span>
              </div>
            ))}
          </div>
        </div>

        <aside className="space-y-3">
          <div className="rounded-[14px] border border-[#EBEBEB] bg-[#FFFFFF] p-4">
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#999999]">Inbox</h3>
            <p className="mt-2 text-[13px] text-[#3B3B3B]">3 replies waiting triage</p>
            <p className="mt-1 text-[13px] text-[#3B3B3B]">2 speakers requested call</p>
          </div>
          <div className="rounded-[14px] border border-[#EBEBEB] bg-[#FFFFFF] p-4">
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#999999]">Next actions</h3>
            <p className="mt-2 text-[13px] text-[#3B3B3B]">1. Approve spring panel shortlist</p>
            <p className="mt-1 text-[13px] text-[#3B3B3B]">2. Follow up with 4 pending speakers</p>
            <p className="mt-1 text-[13px] text-[#3B3B3B]">3. Lock venue details by Friday</p>
          </div>
        </aside>
      </section>
    </DashboardPageShell>
  );
}
