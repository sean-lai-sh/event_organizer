"use client";

import { useState } from "react";

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
    <div className="space-y-4">
      <header className="h-14 border-b border-[#EBEBEB] px-1">
        <h1 className="text-base font-semibold text-[#111111]">Speakers & Outreach</h1>
        <p className="text-xs text-[#7B7B7B]">Monitor relationship and response stages</p>
      </header>

      <section className="rounded-xl border border-[#EBEBEB] bg-[#FFFFFF] p-3">
        <div className="flex flex-col gap-3 lg:flex-row">
          <input
            type="text"
            placeholder="Search speakers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-[#EBEBEB] px-3 py-2 text-sm outline-none focus:border-[#3B3B3B]"
          />
          <div className="flex flex-wrap gap-2">
            {["all", "Confirmed", "Engaged", "Prospect", "Declined"].map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`rounded-md px-3 py-2 text-xs font-medium transition ${
                  filter === status
                    ? "bg-[#0A0A0A] text-white"
                    : "border border-[#EBEBEB] text-[#3B3B3B] hover:bg-[#F4F4F4]"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#EBEBEB] bg-[#FFFFFF]">
        {filteredSpeakers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#EBEBEB] bg-[#F4F4F4]">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-[#6B6B6B]">
                    SPEAKER
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-[#6B6B6B]">
                    COMPANY
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-[#6B6B6B]">
                    STATUS
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-[#6B6B6B]">
                    SOURCE
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-[#6B6B6B]">
                    EVENT
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold text-[#6B6B6B]">
                    LAST CONTACT
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBEBEB]">
                {filteredSpeakers.map((speaker) => (
                  <tr key={speaker.id} className="hover:bg-[#FAFAFA]">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-[#111111]">{speaker.name}</p>
                      <p className="text-xs text-[#7B7B7B]">{speaker.email}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#3B3B3B]">{speaker.company}</td>
                    <td className="px-4 py-3 text-xs font-medium text-[#3B3B3B]">
                      {speaker.status}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#6B6B6B]">{speaker.source}</td>
                    <td className="px-4 py-3 text-xs text-[#6B6B6B]">{speaker.event}</td>
                    <td className="px-4 py-3 text-right text-xs text-[#6B6B6B]">
                      {new Date(speaker.lastContact).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-[#6B6B6B]">No speakers found</div>
        )}
      </section>
    </div>
  );
}
