"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { DashboardPageShell } from "@/components/dashboard/PageShell";
import { api } from "@/convex/_generated/api";
import {
  formatInboxFilterLabel,
  getThreadStatusLabel,
  INBOX_FILTERS,
  selectVisibleThreads,
  toInboxRowModel,
  type InboxFilter,
} from "./communicationsView";

function formatLastActivity(value: number) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getStatusBadgeClasses(state?: string | null) {
  if (state === "resolved") {
    return "border border-[#DADADA] bg-[#FFFFFF] text-[#666666]";
  }
  if (state === "awaiting_member_reply") {
    return "border border-[#DADADA] bg-[#F4F4F4] text-[#2F2F2F]";
  }
  return "border border-[#111111] bg-[#111111] text-[#FFFFFF]";
}

export default function CommunicationsPage() {
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [search, setSearch] = useState("");
  const threads = useQuery(api.inboundDashboard.listOutreachThreads, { filter });

  const visibleThreads = useMemo(
    () => selectVisibleThreads(threads ?? [], filter, search),
    [filter, search, threads]
  );

  return (
    <DashboardPageShell title="Communications">
      <section className="rounded-[14px] border border-[#EBEBEB] bg-[#FFFFFF] p-4">
        <div className="flex flex-col gap-3 xl:flex-row">
          <input
            type="text"
            placeholder="Search threads"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-10 w-full rounded-[8px] border border-[#E0E0E0] bg-transparent px-[14px] text-[14px] font-normal tracking-[-0.01em] text-[#111111] placeholder:font-normal placeholder:tracking-normal placeholder:text-[#999999] outline-none transition focus:border-[#111111]"
          />
          <div className="flex flex-wrap gap-2">
            {INBOX_FILTERS.map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`h-10 rounded-[8px] px-3 text-[12px] font-medium uppercase tracking-[0.04em] transition ${
                  filter === status
                    ? "border border-[#111111] bg-[#111111] text-[#FFFFFF]"
                    : "border border-[#E0E0E0] text-[#555555] hover:bg-[#F4F4F4]"
                }`}
              >
                {formatInboxFilterLabel(status)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[14px] border border-[#EBEBEB] bg-[#FFFFFF]">
        {threads === undefined ? (
          <div className="divide-y divide-[#EBEBEB]">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-[84px] animate-pulse bg-[linear-gradient(180deg,#FFFFFF_0%,#FAFAFA_100%)] px-4 py-3.5"
              />
            ))}
          </div>
        ) : visibleThreads.length > 0 ? (
          <div className="divide-y divide-[#EBEBEB]">
            {visibleThreads.map((thread) => {
              const row = toInboxRowModel(thread);
              return (
                <article
                  key={thread._id}
                  className="px-4 py-3.5 transition hover:bg-[#FAFAFA]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <h2 className="truncate text-[14px] font-semibold text-[#111111]">
                        {row.title}
                      </h2>
                      <p className="truncate text-[12px] text-[#999999]">{row.contactLine}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${getStatusBadgeClasses(
                          thread.inbound_state
                        )}`}
                      >
                        {getThreadStatusLabel(thread)}
                      </span>
                      <p className="mt-2 text-[12px] text-[#7B7B7B]">
                        {formatLastActivity(thread.last_activity_at)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-[12px] text-[#6B6B6B]">
                    <span>{row.messageLabel}</span>
                    <Link
                      href={row.href}
                      className="font-medium text-[#555555] transition hover:text-[#111111]"
                    >
                      View thread
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center text-[14px] text-[#6B6B6B]">No threads found</div>
        )}
      </section>
    </DashboardPageShell>
  );
}
