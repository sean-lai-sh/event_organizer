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
    event: "Tech Conference 2026",
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
    event: "Tech Conference 2026",
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
    event: "Product Launch",
    previous_events: 0,
    lastContact: "2026-03-01",
  },
  {
    id: "4",
    name: "David Kumar",
    email: "david@example.com",
    company: "Future Inc",
    status: "Declined",
    source: "outreach",
    event: "Product Launch",
    previous_events: 3,
    lastContact: "2026-02-28",
  },
];

const StatusBadge = ({ status }: { status: string }) => {
  const statusConfig = {
    Confirmed: { bg: "bg-green-100", text: "text-green-700" },
    Engaged: { bg: "bg-blue-100", text: "text-blue-700" },
    Prospect: { bg: "bg-gray-100", text: "text-gray-700" },
    Declined: { bg: "bg-red-100", text: "text-red-700" },
  };

  const config =
    statusConfig[status as keyof typeof statusConfig] || statusConfig.Prospect;

  return (
    <span
      className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${config.bg} ${config.text}`}
    >
      {status}
    </span>
  );
};

const SourceBadge = ({ source }: { source: string }) => {
  const sourceMap = {
    outreach: "Cold Outreach",
    warm: "Warm Intro",
    in_bound: "Inbound",
    event: "Event Sourcing",
    alumni: "Alumni",
  };

  return (
    <span className="inline-block rounded-full px-2 py-1 text-xs bg-zinc-100 text-zinc-700">
      {sourceMap[source as keyof typeof sourceMap] || source}
    </span>
  );
};

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

  const stats = {
    total: mockSpeakers.length,
    confirmed: mockSpeakers.filter((s) => s.status === "Confirmed").length,
    engaged: mockSpeakers.filter((s) => s.status === "Engaged").length,
    prospect: mockSpeakers.filter((s) => s.status === "Prospect").length,
    declined: mockSpeakers.filter((s) => s.status === "Declined").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900">
            Speakers & Outreach
          </h1>
          <p className="text-zinc-600 mt-1">
            Track speaker engagement and outreach progress
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-5">
        {[
          { label: "Total", value: stats.total, color: "purple" },
          { label: "Confirmed", value: stats.confirmed, color: "green" },
          { label: "Engaged", value: stats.engaged, color: "blue" },
          { label: "Prospect", value: stats.prospect, color: "gray" },
          { label: "Declined", value: stats.declined, color: "red" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
          >
            <p className="text-xs font-medium text-zinc-600">{stat.label}</p>
            <p className="text-2xl font-bold text-zinc-900 mt-1">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search speakers by name, email or company..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            {["all", "Confirmed", "Engaged", "Prospect", "Declined"].map(
              (status) => (
                <button
                  key={status}
                  onClick={() => setFilter(status)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition whitespace-nowrap ${
                    filter === status
                      ? "bg-blue-600 text-white"
                      : "border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ),
            )}
          </div>
        </div>
      </div>

      {/* Speakers Table */}
      <div className="rounded-lg border border-zinc-200 bg-white shadow-sm overflow-hidden">
        {filteredSpeakers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="text-left px-6 py-3 text-sm font-semibold text-zinc-900">
                    Name
                  </th>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-zinc-900">
                    Company
                  </th>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-zinc-900">
                    Status
                  </th>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-zinc-900">
                    Source
                  </th>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-zinc-900">
                    Event
                  </th>
                  <th className="text-center px-6 py-3 text-sm font-semibold text-zinc-900">
                    History
                  </th>
                  <th className="text-right px-6 py-3 text-sm font-semibold text-zinc-900">
                    Last Contact
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {filteredSpeakers.map((speaker) => (
                  <tr key={speaker.id} className="hover:bg-zinc-50 transition">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-zinc-900">
                          {speaker.name}
                        </p>
                        <p className="text-sm text-zinc-600">{speaker.email}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-700">
                      {speaker.company}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={speaker.status} />
                    </td>
                    <td className="px-6 py-4">
                      <SourceBadge source={speaker.source} />
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-700">
                      {speaker.event}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-block rounded-full bg-blue-50 text-blue-600 px-2 py-1 text-xs font-medium">
                        {speaker.previous_events} event
                        {speaker.previous_events !== 1 ? "s" : ""}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-zinc-600">
                      {new Date(speaker.lastContact).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <svg
              className="w-12 h-12 text-zinc-300 mx-auto mb-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-2a6 6 0 0112 0v2zm0 0h6v-2a6 6 0 00-9-5.656v5.656z"
              />
            </svg>
            <p className="text-zinc-600">
              No speakers found matching your criteria
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
