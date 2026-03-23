"use client";

import { useState } from "react";
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
];

export default function SpeakersPage() {
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filteredSpeakers = mockSpeakers.filter((speaker) => {
    const matchesFilter = filter === "all" || speaker.status === filter;
    const matchesSearch =
      speaker.name.toLowerCase().includes(search.toLowerCase()) ||
      speaker.email.toLowerCase().includes(search.toLowerCase()) ||
      speaker.company.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <DashboardPageShell
      title="Speakers"
    >
      <section className="rounded-[14px] border border-[#EBEBEB] bg-[#FFFFFF] p-4">
        <div className="flex flex-col gap-3 xl:flex-row">
          <input
            type="text"
            placeholder="Search speakers"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-[8px] border border-[#E0E0E0] bg-transparent px-[14px] text-[14px] text-[#111111] outline-none transition focus:border-[#111111]"
          />
          <div className="flex flex-wrap gap-2">
            {["all", "Confirmed", "Engaged", "Prospect", "Declined"].map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`h-10 rounded-[8px] px-3 text-[12px] font-medium uppercase tracking-[0.04em] transition ${
                  filter === status
                    ? "border border-[#111111] bg-[#111111] text-[#FFFFFF]"
                    : "border border-[#E0E0E0] text-[#555555] hover:bg-[#F4F4F4]"
                }`}
              >
                {status}
              </button>
            ))}
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
