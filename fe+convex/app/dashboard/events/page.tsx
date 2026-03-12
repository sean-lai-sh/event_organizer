"use client";

import Link from "next/link";
import { useState } from "react";

const mockEvents = [
  {
    _id: "1",
    title: "Tech Conference 2026",
    description: "Annual company tech conference",
    event_date: "2026-04-15",
    status: "matching",
    speaker_confirmed: false,
    room_confirmed: true,
    created_at: Date.now(),
  },
  {
    _id: "2",
    title: "Product Launch Event",
    description: "New product announcement",
    event_date: "2026-05-01",
    status: "outreach",
    speaker_confirmed: true,
    room_confirmed: true,
    created_at: Date.now(),
  },
  {
    _id: "3",
    title: "Engineering Workshop",
    description: "Deep dive into new technologies",
    event_date: "2026-03-20",
    status: "completed",
    speaker_confirmed: true,
    room_confirmed: true,
    created_at: Date.now(),
  },
];

const StatusBadge = ({ status }: { status: string }) => {
  const statusConfig = {
    draft: { bg: "bg-gray-100", text: "text-gray-700" },
    matching: { bg: "bg-blue-100", text: "text-blue-700" },
    outreach: { bg: "bg-purple-100", text: "text-purple-700" },
    completed: { bg: "bg-green-100", text: "text-green-700" },
  };

  const config =
    statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;

  return (
    <span
      className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${config.bg} ${config.text}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900">Events</h1>
          <p className="text-zinc-600 mt-1">Manage and track all your events</p>
        </div>
        <Link
          href="/dashboard/events/new"
          className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition"
        >
          + New Event
        </Link>
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search events..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            {["all", "draft", "matching", "outreach", "completed"].map(
              (status) => (
                <button
                  key={status}
                  onClick={() => setFilter(status)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
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

      {/* Events Table */}
      <div className="rounded-lg border border-zinc-200 bg-white shadow-sm overflow-hidden">
        {filteredEvents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="text-left px-6 py-3 text-sm font-semibold text-zinc-900">
                    Event Title
                  </th>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-zinc-900">
                    Date
                  </th>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-zinc-900">
                    Status
                  </th>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-zinc-900">
                    Progress
                  </th>
                  <th className="text-right px-6 py-3 text-sm font-semibold text-zinc-900">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {filteredEvents.map((event) => (
                  <tr key={event._id} className="hover:bg-zinc-50 transition">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-zinc-900">
                          {event.title}
                        </p>
                        <p className="text-sm text-zinc-600">
                          {event.description}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-700">
                      {new Date(event.event_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={event.status} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm">
                        {event.speaker_confirmed && (
                          <span
                            className="inline-block w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold"
                            title="Speaker Confirmed"
                          >
                            ✓
                          </span>
                        )}
                        {event.room_confirmed && (
                          <span
                            className="inline-block w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold"
                            title="Room Confirmed"
                          >
                            ✓
                          </span>
                        )}
                        {!event.speaker_confirmed && (
                          <span
                            className="inline-block w-6 h-6 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-xs"
                            title="Speaker Pending"
                          >
                            ○
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/dashboard/events/${event._id}`}
                        className="text-blue-600 hover:underline text-sm font-medium"
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
                d="M8 7V3m8 4V3m-9 8h18M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-zinc-600">No events found</p>
            <Link
              href="/dashboard/events/new"
              className="text-blue-600 hover:underline text-sm mt-2 inline-block"
            >
              Create your first event
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
