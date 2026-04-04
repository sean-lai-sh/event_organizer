"use client";

import { useMemo, useRef, useState } from "react";
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
] as const;

const communicationStatusOptions = [
  { value: "all", label: "All statuses" },
  { value: "needs_review", label: "Needs review" },
  { value: "awaiting_reply", label: "Awaiting reply" },
  { value: "resolved", label: "Resolved" },
] as const;

type CommunicationStatusFilter = (typeof communicationStatusOptions)[number]["value"];

function formatStatus(status: string) {
  if (status === "awaiting_reply") return "Awaiting Reply";
  if (status === "needs_review") return "Needs Review";
  return "Resolved";
}

export default function CommunicationsPage() {
  const closeFilterTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [openFilter, setOpenFilter] = useState<null | "status">(null);
  const [statusFilter, setStatusFilter] = useState<CommunicationStatusFilter>("all");
  const [search, setSearch] = useState("");

  const hasActiveFilters = search.length > 0 || statusFilter !== "all";

  const filteredThreads = useMemo(() => {
    const query = search.trim().toLowerCase();

    return mockThreads.filter((thread) => {
      const matchesFilter = statusFilter === "all" || thread.status === statusFilter;
      const matchesSearch =
        !query ||
        thread.subject.toLowerCase().includes(query) ||
        thread.speaker.toLowerCase().includes(query) ||
        thread.from.toLowerCase().includes(query);

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
    <DashboardPageShell title="Communications">
      <section className="rounded-[14px] border border-[#EBEBEB] bg-[#FFFFFF] p-4">
        <div className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="Search threads"
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
                className={`absolute left-0 top-full z-20 mt-2 min-w-[170px] flex-col gap-1 rounded-[10px] border border-[#EBEBEB] bg-[#FFFFFF] p-2 shadow-sm ${
                  openFilter === "status" ? "flex" : "hidden"
                }`}
              >
                {communicationStatusOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStatusFilter(option.value)}
                    className={`rounded-[6px] px-2 py-1 text-left text-[12px] transition ${
                      statusFilter === option.value
                        ? "bg-[#F4F4F4] font-semibold text-[#111111]"
                        : "text-[#6B6B6B] hover:bg-[#FAFAFA]"
                    }`}
                  >
                    {option.label}
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
