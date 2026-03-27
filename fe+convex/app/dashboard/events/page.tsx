"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { DashboardPageShell } from "@/components/dashboard/PageShell";
import { api } from "@/convex/_generated/api";

const statusOptions = ["all", "draft", "matching", "outreach", "completed"] as const;

function formatStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatEventDate(eventDate?: string): string {
  if (!eventDate) return "TBD";
  const date = new Date(eventDate);
  if (Number.isNaN(date.getTime())) return eventDate;
  return date.toLocaleDateString();
}

export default function EventsPage() {
  const [filter, setFilter] = useState<(typeof statusOptions)[number]>("all");
  const [search, setSearch] = useState("");

  const events = useQuery(api.events.listEvents, {
    status: filter === "all" ? undefined : filter,
  });

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = events ?? [];
    if (!q) return rows;

    return rows.filter((event) => {
      const title = event.title.toLowerCase();
      const description = (event.description ?? "").toLowerCase();
      const location = (event.location ?? "").toLowerCase();
      return title.includes(q) || description.includes(q) || location.includes(q);
    });
  }, [events, search]);

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
            className="h-10 w-full rounded-[8px] border border-[#E0E0E0] bg-transparent px-[14px] text-[14px] font-normal tracking-[-0.01em] text-[#111111] placeholder:font-normal placeholder:tracking-normal placeholder:text-[#999999] outline-none transition focus:border-[#111111]"
          />
          <div className="flex flex-wrap gap-2">
            {statusOptions.map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`h-10 rounded-[8px] px-3 text-[12px] font-medium uppercase tracking-[0.04em] transition ${
                  filter === status
                    ? "border border-[#111111] bg-[#111111] text-[#FFFFFF]"
                    : "border border-[#E0E0E0] text-[#555555] hover:bg-[#F4F4F4]"
                }`}
              >
                {formatStatus(status)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[14px] border border-[#EBEBEB] bg-[#FFFFFF]">
        {events === undefined ? (
          <div className="p-8 text-center text-[14px] text-[#6B6B6B]">Loading events...</div>
        ) : filteredEvents.length > 0 ? (
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
                      <p className="text-[12px] text-[#999999]">
                        {event.description?.trim() || "No description yet"}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-[13px] text-[#6B6B6B]">
                      {formatEventDate(event.event_date)}
                    </td>
                    <td className="px-4 py-3.5 text-[12px] font-medium text-[#3B3B3B]">
                      {formatStatus(event.status)}
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
