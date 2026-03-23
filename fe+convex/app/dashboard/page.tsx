"use client";

import Link from "next/link";
import { useMemo } from "react";

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
    <div className="rounded-xl border border-[#EBEBEB] bg-[#FFFFFF] px-4 py-3">
      <p className="text-[11px] font-medium text-[#7B7B7B]">{label}</p>
      <p className="mt-1 font-mono text-2xl font-bold text-[#111111]">{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const events = useEvents();
  const eventRows = useMemo(() => events.slice(0, 3), [events]);

  return (
    <div className="space-y-4">
      <header className="flex h-14 items-center justify-between border-b border-[#EBEBEB] px-1">
        <h1 className="text-base font-semibold text-[#111111]">Dashboard</h1>
        <Link
          href="/dashboard/events/new"
          className="inline-flex items-center rounded-[10px] bg-[#0A0A0A] px-3 py-2 text-[13px] font-medium text-white transition hover:bg-[#1F1F1F]"
        >
          + New Event
        </Link>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Total Events" value={24} />
        <MetricCard label="Active Outreach" value={8} />
        <MetricCard label="Accepted Speakers" value={12} />
        <MetricCard label="Upcoming" value={5} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-[#111111]">Recent Events</h2>
            <Link href="/dashboard/events" className="text-[13px] font-medium text-[#3B3B3B]">
              View all →
            </Link>
          </div>

          <div className="overflow-hidden rounded-[14px] border border-[#EBEBEB] bg-[#FFFFFF]">
            <div className="grid h-10 grid-cols-[1.5fr_1fr_1fr_0.9fr] items-center bg-[#F4F4F4] px-4 text-[11px] font-semibold text-[#6B6B6B]">
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
                <span className="text-[#3B3B3B]">{event.type}</span>
                <span className="text-[#6B6B6B]">
                  {new Date(event.event_date).toLocaleDateString()}
                </span>
                <span className="font-medium text-[#3B3B3B]">{event.status}</span>
              </div>
            ))}
          </div>
        </div>

        <aside className="space-y-3">
          <div className="rounded-xl border border-[#EBEBEB] bg-[#FFFFFF] p-3">
            <h3 className="text-xs font-semibold text-[#111111]">Inbox</h3>
            <p className="mt-2 text-xs text-[#3B3B3B]">• 3 replies waiting triage</p>
            <p className="mt-1 text-xs text-[#3B3B3B]">• 2 speakers requested call</p>
          </div>
          <div className="rounded-xl border border-[#EBEBEB] bg-[#FFFFFF] p-3">
            <h3 className="text-xs font-semibold text-[#111111]">Next Actions</h3>
            <p className="mt-2 text-xs text-[#3B3B3B]">
              1. Approve Spring panel shortlist
            </p>
            <p className="mt-1 text-xs text-[#3B3B3B]">
              2. Follow up with 4 pending speakers
            </p>
            <p className="mt-1 text-xs text-[#3B3B3B]">
              3. Lock venue details by Friday
            </p>
          </div>
        </aside>
      </section>
    </div>
  );
}
