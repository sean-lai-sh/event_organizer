"use client";

import Link from "next/link";
import { useState } from "react";

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
    <span className="text-xs font-medium text-[#3B3B3B]">
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
    <div className="space-y-4">
      <header className="flex h-14 items-center justify-between border-b border-[#EBEBEB] px-1">
        <div>
          <h1 className="text-base font-semibold text-[#111111]">Events</h1>
          <p className="text-xs text-[#7B7B7B]">Track timelines and readiness</p>
        </div>
        <Link
          href="/dashboard/events/new"
          className="inline-flex items-center rounded-[10px] bg-[#0A0A0A] px-3 py-2 text-[13px] font-medium text-white transition hover:bg-[#1F1F1F]"
        >
          + New Event
        </Link>
      </header>

      <section className="rounded-xl border border-[#EBEBEB] bg-[#FFFFFF] p-3">
        <div className="flex flex-col gap-3 lg:flex-row">
          <input
            type="text"
            placeholder="Search events..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-[#EBEBEB] px-3 py-2 text-sm outline-none focus:border-[#3B3B3B]"
          />
          <div className="flex flex-wrap gap-2">
            {["all", "draft", "matching", "outreach", "completed"].map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`rounded-md px-3 py-2 text-xs font-medium transition ${
                  filter === status
                    ? "bg-[#0A0A0A] text-white"
                    : "border border-[#EBEBEB] text-[#3B3B3B] hover:bg-[#F4F4F4]"
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#EBEBEB] bg-[#FFFFFF]">
        {filteredEvents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#EBEBEB] bg-[#F4F4F4]">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-[#6B6B6B]">
                    EVENT
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-[#6B6B6B]">
                    DATE
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-[#6B6B6B]">
                    STATUS
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-[#6B6B6B]">
                    READINESS
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold text-[#6B6B6B]">
                    ACTION
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBEBEB]">
                {filteredEvents.map((event) => (
                  <tr key={event._id} className="hover:bg-[#FAFAFA]">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-[#111111]">{event.title}</p>
                      <p className="text-xs text-[#7B7B7B]">{event.description}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#6B6B6B]">
                      {new Date(event.event_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <StatusText status={event.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-[#6B6B6B]">
                      {event.speaker_confirmed ? "Speaker ✓" : "Speaker ○"} ·{" "}
                      {event.room_confirmed ? "Room ✓" : "Room ○"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/events/${event._id}`}
                        className="text-xs font-medium text-[#3B3B3B] hover:underline"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-[#6B6B6B]">No events found</div>
        )}
      </section>
    </div>
  );
}
