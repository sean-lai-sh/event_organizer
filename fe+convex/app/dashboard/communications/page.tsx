"use client";

import Link from "next/link";
import { useState } from "react";

const mockThreads = [
  {
    id: "1",
    subject: "Speaking opportunity at Tech Conference",
    from: "sarah@example.com",
    speaker: "Sarah Chen",
    status: "resolved",
    messages: 5,
    lastMessage: "2026-03-10",
    preview:
      "Thank you for the invitation! I'd love to speak at your conference.",
  },
  {
    id: "2",
    subject: "Product Launch Event - Interested?",
    from: "james@example.com",
    speaker: "James Wilson",
    status: "awaiting_reply",
    messages: 2,
    lastMessage: "2026-03-08",
    preview: "Can you tell me more about the target audience and format?",
  },
  {
    id: "3",
    subject: "Following up on Engineering Workshop",
    from: "maria@example.com",
    speaker: "Maria Garcia",
    status: "needs_review",
    messages: 3,
    lastMessage: "2026-03-06",
    preview: "I would need more details about the time commitment...",
  },
  {
    id: "4",
    subject: "Re: Speaking opportunity",
    from: "david@example.com",
    speaker: "David Kumar",
    status: "resolved",
    messages: 4,
    lastMessage: "2026-02-28",
    preview:
      "Unfortunately, I won't be able to participate due to prior commitments.",
  },
  {
    id: "5",
    subject: "New speaker inquiry",
    from: "alex@example.com",
    speaker: "Alex Thompson",
    status: "needs_review",
    messages: 1,
    lastMessage: "2026-03-11",
    preview:
      "Hi, I noticed your event and would love to be considered as a speaker.",
  },
];

const StatusBadge = ({ status }: { status: string }) => {
  const statusConfig = {
    resolved: { bg: "bg-green-100", text: "text-green-700", icon: "✓" },
    awaiting_reply: { bg: "bg-blue-100", text: "text-blue-700", icon: "⏳" },
    needs_review: { bg: "bg-orange-100", text: "text-orange-700", icon: "!" },
  };

  const config =
    statusConfig[status as keyof typeof statusConfig] ||
    statusConfig.needs_review;
  const label =
    status === "awaiting_reply"
      ? "Awaiting Reply"
      : status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ");

  return (
    <span
      className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${config.bg} ${config.text}`}
    >
      {config.icon} {label}
    </span>
  );
};

export default function CommunicationsPage() {
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filteredThreads = mockThreads.filter((thread) => {
    const matchesFilter = filter === "all" || thread.status === filter;
    const matchesSearch =
      thread.subject.toLowerCase().includes(search.toLowerCase()) ||
      thread.speaker.toLowerCase().includes(search.toLowerCase()) ||
      thread.from.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const stats = {
    total: mockThreads.length,
    needs_review: mockThreads.filter((t) => t.status === "needs_review").length,
    awaiting_reply: mockThreads.filter((t) => t.status === "awaiting_reply")
      .length,
    resolved: mockThreads.filter((t) => t.status === "resolved").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900">Communications</h1>
          <p className="text-zinc-600 mt-1">
            Monitor and manage email threads with speakers
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Total Threads", value: stats.total, color: "purple" },
          { label: "Needs Review", value: stats.needs_review, color: "orange" },
          {
            label: "Awaiting Reply",
            value: stats.awaiting_reply,
            color: "blue",
          },
          { label: "Resolved", value: stats.resolved, color: "green" },
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
              placeholder="Search threads..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            {["all", "needs_review", "awaiting_reply", "resolved"].map(
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
                  {status === "needs_review"
                    ? "Review"
                    : status === "awaiting_reply"
                      ? "Waiting"
                      : "Resolved"}
                </button>
              ),
            )}
          </div>
        </div>
      </div>

      {/* Threads List */}
      <div className="rounded-lg border border-zinc-200 bg-white shadow-sm overflow-hidden">
        {filteredThreads.length > 0 ? (
          <div className="divide-y divide-zinc-200">
            {filteredThreads.map((thread) => (
              <div
                key={thread.id}
                className="p-6 hover:bg-zinc-50 transition border-b border-zinc-200 last:border-b-0"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <h3 className="font-semibold text-zinc-900">
                            {thread.subject}
                          </h3>
                          <p className="text-sm text-zinc-600 mt-1">
                            From:{" "}
                            <span className="font-medium">
                              {thread.speaker}
                            </span>{" "}
                            ({thread.from})
                          </p>
                        </div>
                        <StatusBadge status={thread.status} />
                      </div>
                      <p className="text-sm text-zinc-600 mt-2 line-clamp-2">
                        {thread.preview}
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <div className="text-xs text-zinc-500">
                        {thread.messages} message
                        {thread.messages !== 1 ? "s" : ""}
                      </div>
                      <div className="text-xs text-zinc-500 mt-1">
                        {new Date(thread.lastMessage).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button className="text-sm text-blue-600 hover:underline font-medium">
                      View Thread
                    </button>
                    {thread.status === "needs_review" && (
                      <>
                        <span className="text-zinc-300">•</span>
                        <button className="text-sm text-green-600 hover:underline font-medium">
                          Mark Resolved
                        </button>
                      </>
                    )}
                    {thread.status === "awaiting_reply" && (
                      <>
                        <span className="text-zinc-300">•</span>
                        <button className="text-sm text-blue-600 hover:underline font-medium">
                          Send Reply
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
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
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            <p className="text-zinc-600">No threads found</p>
          </div>
        )}
      </div>
    </div>
  );
}
