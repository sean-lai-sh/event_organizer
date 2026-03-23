"use client";

import { useState } from "react";
import { DashboardPageShell } from "@/components/dashboard/PageShell";

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
    <DashboardPageShell
      title="Communications"
    >
      <section className="rounded-[14px] border border-[#EBEBEB] bg-[#FFFFFF] p-4">
        <div className="flex flex-col gap-3 xl:flex-row">
          <input
            type="text"
            placeholder="Search threads"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-[8px] border border-[#E0E0E0] bg-transparent px-[14px] text-[14px] text-[#111111] outline-none transition focus:border-[#111111]"
          />
          <div className="flex flex-wrap gap-2">
            {["all", "needs_review", "awaiting_reply", "resolved"].map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`h-10 rounded-[8px] px-3 text-[12px] font-medium uppercase tracking-[0.04em] transition ${
                  filter === status
                    ? "border border-[#111111] bg-[#111111] text-[#FFFFFF]"
                    : "border border-[#E0E0E0] text-[#555555] hover:bg-[#F4F4F4]"
                }`}
              >
                {status === "all" ? "All" : formatStatus(status)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[14px] border border-[#EBEBEB] bg-[#FFFFFF]">
        {filteredThreads.length > 0 ? (
          <div className="divide-y divide-[#EBEBEB]">
            {filteredThreads.map((thread) => (
              <article key={thread.id} className="px-4 py-3.5 hover:bg-[#FAFAFA]">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h2 className="text-[14px] font-semibold text-[#111111]">{thread.subject}</h2>
                    <p className="text-[12px] text-[#999999]">
                      {thread.speaker} · {thread.from}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[12px] font-medium text-[#3B3B3B]">
                      {formatStatus(thread.status)}
                    </p>
                    <p className="text-[12px] text-[#7B7B7B]">
                      {new Date(thread.lastMessage).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="mt-2.5 flex items-center justify-between text-[12px] text-[#6B6B6B]">
                  <span>
                    {thread.messages} message{thread.messages === 1 ? "" : "s"}
                  </span>
                  <button className="font-medium text-[#555555] transition hover:text-[#111111]">
                    View thread
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-[14px] text-[#6B6B6B]">No threads found</div>
        )}
      </section>
    </DashboardPageShell>
  );
}
