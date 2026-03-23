"use client";

import { useState } from "react";

const mockThreads = [
  {
    id: "1",
    subject: "Speaking opportunity at AI & Society Panel",
    speaker: "Sarah Chen",
    from: "sarah@example.com",
    status: "resolved",
    messages: 5,
    lastMessage: "2026-03-10",
  },
  {
    id: "2",
    subject: "Web3 workshop format questions",
    speaker: "James Wilson",
    from: "james@example.com",
    status: "awaiting_reply",
    messages: 2,
    lastMessage: "2026-03-08",
  },
  {
    id: "3",
    subject: "Availability for networking mixer",
    speaker: "Maria Garcia",
    from: "maria@example.com",
    status: "needs_review",
    messages: 3,
    lastMessage: "2026-03-06",
  },
];

function formatStatus(status: string) {
  if (status === "awaiting_reply") return "Awaiting Reply";
  if (status === "needs_review") return "Needs Review";
  return "Resolved";
}

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

  return (
    <div className="space-y-4">
      <header className="h-14 border-b border-[#EBEBEB] px-1">
        <h1 className="text-base font-semibold text-[#111111]">Communications</h1>
        <p className="text-xs text-[#7B7B7B]">Review speaker inbox and thread states</p>
      </header>

      <section className="rounded-xl border border-[#EBEBEB] bg-[#FFFFFF] p-3">
        <div className="flex flex-col gap-3 lg:flex-row">
          <input
            type="text"
            placeholder="Search threads..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-[#EBEBEB] px-3 py-2 text-sm outline-none focus:border-[#3B3B3B]"
          />
          <div className="flex flex-wrap gap-2">
            {["all", "needs_review", "awaiting_reply", "resolved"].map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`rounded-md px-3 py-2 text-xs font-medium transition ${
                  filter === status
                    ? "bg-[#0A0A0A] text-white"
                    : "border border-[#EBEBEB] text-[#3B3B3B] hover:bg-[#F4F4F4]"
                }`}
              >
                {status === "all" ? "All" : formatStatus(status)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#EBEBEB] bg-[#FFFFFF]">
        {filteredThreads.length > 0 ? (
          <div className="divide-y divide-[#EBEBEB]">
            {filteredThreads.map((thread) => (
              <article key={thread.id} className="p-4 hover:bg-[#FAFAFA]">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h2 className="text-sm font-semibold text-[#111111]">{thread.subject}</h2>
                    <p className="text-xs text-[#7B7B7B]">
                      {thread.speaker} · {thread.from}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium text-[#3B3B3B]">
                      {formatStatus(thread.status)}
                    </p>
                    <p className="text-xs text-[#7B7B7B]">
                      {new Date(thread.lastMessage).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-[#6B6B6B]">
                  <span>
                    {thread.messages} message{thread.messages === 1 ? "" : "s"}
                  </span>
                  <button className="font-medium text-[#3B3B3B] hover:underline">
                    View thread →
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-[#6B6B6B]">No threads found</div>
        )}
      </section>
    </div>
  );
}
