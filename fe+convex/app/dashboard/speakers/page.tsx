"use client";

import { useMemo, useRef, useState } from "react";
import { DashboardPageShell } from "@/components/dashboard/PageShell";

const mockSpeakers = [
  {
    id: "1",
    name: "Sarah Chen",
    email: "sarah@example.com",
    company: "Tech Corp",
    status: "Confirmed",
    source: "outreach",
    event: "AI & Society Speaker Panel",
    previous_events: 2,
    lastContact: "2026-03-10",
  },
  {
    id: "2",
    name: "James Wilson",
    email: "james@example.com",
    company: "Innovation Labs",
    status: "Engaged",
    source: "warm",
    event: "Web3 & Startups Workshop",
    previous_events: 1,
    lastContact: "2026-03-08",
  },
  {
    id: "3",
    name: "Maria Garcia",
    email: "maria@example.com",
    company: "Global Tech",
    status: "Prospect",
    source: "event",
    event: "Spring Networking Mixer",
    previous_events: 0,
    lastContact: "2026-03-01",
  },
  {
    id: "4",
    name: "Noah Patel",
    email: "noah@example.com",
    company: "Foundry Labs",
    status: "Declined",
    source: "alumni",
    event: "Founder Fireside: Scaling from 0 → 1",
    previous_events: 1,
    lastContact: "2026-02-26",
  },
] as const;

const speakerStatusOptions = ["all", "Confirmed", "Engaged", "Prospect", "Declined"] as const;

type SpeakerStatusFilter = (typeof speakerStatusOptions)[number];

export default function SpeakersPage() {
  const closeFilterTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [openFilter, setOpenFilter] = useState<null | "status">(null);
  const [statusFilter, setStatusFilter] = useState<SpeakerStatusFilter>("all");
  const [search, setSearch] = useState("");

  const hasActiveFilters = search.length > 0 || statusFilter !== "all";

  const filteredSpeakers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return mockSpeakers.filter((speaker) => {
      const matchesFilter = statusFilter === "all" || speaker.status === statusFilter;
      const matchesSearch =
        !query ||
        speaker.name.toLowerCase().includes(query) ||
        speaker.email.toLowerCase().includes(query) ||
        speaker.company.toLowerCase().includes(query) ||
        speaker.event.toLowerCase().includes(query);

      return matchesFilter && matchesSearch;
    });
  }, [search, statusFilter]);

  function openFilterMenu(filter: "status") {
    if (closeFilterTimeoutRef.current) {
      clearTimeout(closeFilterTimeoutRef.current);
      closeFilterTimeoutRef.current = null;
    }
    setOpenFilter(filter);
  }

  function scheduleCloseFilter(filter: "status") {
    if (closeFilterTimeoutRef.current) {
      clearTimeout(closeFilterTimeoutRef.current);
    }

    closeFilterTimeoutRef.current = setTimeout(() => {
      setOpenFilter((current) => (current === filter ? null : current));
      closeFilterTimeoutRef.current = null;
    }, 320);
  }

  function resetFilters() {
    setSearch("");
    setStatusFilter("all");
    setOpenFilter(null);
  }

  return (
    <DashboardPageShell title="Speakers">
      <section className="rounded-[14px] border border-[#EBEBEB] bg-[#FFFFFF] p-4">
        <div className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="Search speakers"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-[8px] border border-[#E0E0E0] bg-transparent px-[14px] text-[14px] font-normal tracking-[-0.01em] text-[#111111] placeholder:font-normal placeholder:tracking-normal placeholder:text-[#999999] outline-none transition focus:border-[#111111]"
          />
          <div className="flex flex-wrap items-center gap-5">
            <div
              className="relative min-w-[120px]"
              onMouseEnter={() => openFilterMenu("status")}
              onMouseLeave={() => scheduleCloseFilter("status")}
            >
              <button
                type="button"
                className="text-[12px] font-medium text-[#555555] transition hover:text-[#111111]"
              >
                Status
              </button>
              <div
                className={`absolute left-0 top-full z-20 mt-2 min-w-[160px] flex-col gap-1 rounded-[10px] border border-[#EBEBEB] bg-[#FFFFFF] p-2 shadow-sm ${
                  openFilter === "status" ? "flex" : "hidden"
                }`}
              >
                {speakerStatusOptions.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    className={`rounded-[6px] px-2 py-1 text-left text-[12px] transition ${
                      statusFilter === status
                        ? "bg-[#F4F4F4] font-semibold text-[#111111]"
                        : "text-[#6B6B6B] hover:bg-[#FAFAFA]"
                    }`}
                  >
                    {status === "all" ? "All statuses" : status}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={resetFilters}
              disabled={!hasActiveFilters}
              className="text-[12px] font-medium text-[#000000] transition hover:text-[#000000] disabled:cursor-not-allowed disabled:text-[#BBBBBB]"
            >
              Reset
            </button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[14px] border border-[#EBEBEB] bg-[#FFFFFF]">
        {filteredSpeakers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#EBEBEB] bg-[#F4F4F4]">
                  <th className="h-10 px-4 text-left text-[11px] font-semibold tracking-[0.04em] text-[#6B6B6B]">
                    SPEAKER
                  </th>
                  <th className="h-10 px-4 text-left text-[11px] font-semibold tracking-[0.04em] text-[#6B6B6B]">
                    COMPANY
                  </th>
                  <th className="h-10 px-4 text-left text-[11px] font-semibold tracking-[0.04em] text-[#6B6B6B]">
                    STATUS
                  </th>
                  <th className="h-10 px-4 text-left text-[11px] font-semibold tracking-[0.04em] text-[#6B6B6B]">
                    SOURCE
                  </th>
                  <th className="h-10 px-4 text-left text-[11px] font-semibold tracking-[0.04em] text-[#6B6B6B]">
                    EVENT
                  </th>
                  <th className="h-10 px-4 text-right text-[11px] font-semibold tracking-[0.04em] text-[#6B6B6B]">
                    LAST CONTACT
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBEBEB]">
                {filteredSpeakers.map((speaker) => (
                  <tr key={speaker.id} className="hover:bg-[#FAFAFA]">
                    <td className="px-4 py-3.5">
                      <p className="text-[14px] font-medium text-[#111111]">{speaker.name}</p>
                      <p className="text-[12px] text-[#999999]">{speaker.email}</p>
                    </td>
                    <td className="px-4 py-3.5 text-[13px] text-[#3B3B3B]">{speaker.company}</td>
                    <td className="px-4 py-3.5 text-[12px] font-medium text-[#3B3B3B]">
                      {speaker.status}
                    </td>
                    <td className="px-4 py-3.5 text-[12px] text-[#6B6B6B]">{speaker.source}</td>
                    <td className="px-4 py-3.5 text-[12px] text-[#6B6B6B]">{speaker.event}</td>
                    <td className="px-4 py-3.5 text-right text-[12px] text-[#6B6B6B]">
                      {new Date(speaker.lastContact).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-[14px] text-[#6B6B6B]">No speakers found</div>
        )}
      </section>
    </DashboardPageShell>
  );
}
