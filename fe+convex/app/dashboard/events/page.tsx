"use client";

import Link from "next/link";
import { useState } from "react";
import { DashboardPageShell } from "@/components/dashboard/PageShell";

const mockEvents = [
  {
    _id: "1",
    title: "AI & Society Speaker Panel",
    description: "Panel with startup founders and AI policy leads",
    event_date: "2026-03-28",
    status: "matching",
    speaker_confirmed: false,
    room_confirmed: true,
  },
  {
    _id: "2",
    title: "Web3 & Startups Workshop",
    description: "Operator workshop with alumni founders",
    event_date: "2026-04-05",
    status: "outreach",
    speaker_confirmed: true,
    room_confirmed: true,
  },
  {
    _id: "3",
    title: "Spring Networking Mixer",
    description: "Cross-club networking and sponsorship session",
    event_date: "2026-04-18",
    status: "completed",
    speaker_confirmed: true,
    room_confirmed: true,
  },
];

function StatusText({ status }: { status: string }) {
  return (
    <span className="text-[12px] font-medium text-[#3B3B3B]">
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function EventsPage() {
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filteredEvents = mockEvents.filter((event) => {
    const matchesFilter = filter === "all" || event.status === filter;
    const matchesSearch = event.title
      .toLowerCase()
      .includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <DashboardPageShell
      title="Events"
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
      <section className="rounded-[14px] border border-[#EBEBEB] bg-[#FFFFFF] p-4">
        <div className="flex flex-col gap-3 xl:flex-row">
          <input
            type="text"
            placeholder="Search events"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-[8px] border border-[#E0E0E0] bg-transparent px-[14px] text-[14px] text-[#111111] outline-none transition focus:border-[#111111]"
          />
          <div className="flex flex-wrap gap-2">
            {["all", "draft", "matching", "outreach", "completed"].map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`h-10 rounded-[8px] px-3 text-[12px] font-medium uppercase tracking-[0.04em] transition ${
                  filter === status
                    ? "border border-[#111111] bg-[#111111] text-[#FFFFFF]"
                    : "border border-[#E0E0E0] text-[#555555] hover:bg-[#F4F4F4]"
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[14px] border border-[#EBEBEB] bg-[#FFFFFF]">
        {filteredEvents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#EBEBEB] bg-[#F4F4F4]">
                  <th className="h-10 px-4 text-left text-[11px] font-semibold tracking-[0.04em] text-[#6B6B6B]">
                    EVENT
                  </th>
                  <th className="h-10 px-4 text-left text-[11px] font-semibold tracking-[0.04em] text-[#6B6B6B]">
                    DATE
                  </th>
                  <th className="h-10 px-4 text-left text-[11px] font-semibold tracking-[0.04em] text-[#6B6B6B]">
                    STATUS
                  </th>
                  <th className="h-10 px-4 text-left text-[11px] font-semibold tracking-[0.04em] text-[#6B6B6B]">
                    READINESS
                  </th>
                  <th className="h-10 px-4 text-right text-[11px] font-semibold tracking-[0.04em] text-[#6B6B6B]">
                    ACTION
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBEBEB]">
                {filteredEvents.map((event) => (
                  <tr key={event._id} className="hover:bg-[#FAFAFA]">
                    <td className="px-4 py-3.5">
                      <p className="text-[14px] font-medium text-[#111111]">{event.title}</p>
                      <p className="text-[12px] text-[#999999]">{event.description}</p>
                    </td>
                    <td className="px-4 py-3.5 text-[13px] text-[#6B6B6B]">
                      {new Date(event.event_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusText status={event.status} />
                    </td>
                    <td className="px-4 py-3.5 text-[12px] text-[#6B6B6B]">
                      {event.speaker_confirmed ? "Speaker ✓" : "Speaker ○"} ·{" "}
                      {event.room_confirmed ? "Room ✓" : "Room ○"}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Link
                        href={`/dashboard/events/${event._id}`}
                        className="text-[12px] font-medium text-[#555555] hover:text-[#111111]"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-[14px] text-[#6B6B6B]">No events found</div>
        )}
      </section>
    </DashboardPageShell>
  );
}
