"use client";

import Link from "next/link";
import { useMemo } from "react";
import { DashboardPageShell } from "@/components/dashboard/PageShell";

const kpis = [
  { label: "total events",       value: "24" },
  { label: "active outreach",    value: "8"  },
  { label: "speakers confirmed", value: "12" },
  { label: "upcoming",           value: "5"  },
];

const mockEvents = [
  { _id: "1", title: "AI & Society Speaker Panel", event_date: "2026-03-28", type: "Speaker Panel", status: "Outreach"  },
  { _id: "2", title: "Web3 & Startups Workshop",   event_date: "2026-04-05", type: "Workshop",      status: "Matching"  },
  { _id: "3", title: "Spring Networking Mixer",    event_date: "2026-04-18", type: "Networking",    status: "Completed" },
];

export default function DashboardPage() {
  const eventRows = useMemo(() => mockEvents.slice(0, 3), []);

  return (
    <DashboardPageShell
      title="Dashboard"
      action={
        <Link
          href="/dashboard/events/new"
          className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-[#E0E0E0] bg-white px-4 text-[13px] font-medium text-[#111111] transition hover:bg-[#F4F4F4]"
        >
          <span className="text-base leading-none">+</span>
          New event
        </Link>
      }
    >
      {/* KPI row — hero kpi-card motif */}
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="flex flex-col gap-2 rounded-[18px] border border-[#e8e8e8] bg-[#f4f4f4] p-4"
          >
            <span className="font-[var(--font-outfit)] text-[34px] font-light leading-none tracking-[-0.04em] text-[#1f1f1f]">
              {k.value}
            </span>
            <span className="text-[13px] font-medium text-[#767676]">{k.label}</span>
          </div>
        ))}
      </section>

      {/* Main grid */}
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">

        {/* Recent events table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-[#111111]">Recent events</h2>
            <Link href="/dashboard/events" className="text-[13px] font-medium text-[#6B6B6B] hover:text-[#111111]">
              View all
            </Link>
          </div>
          <div className="overflow-hidden rounded-[12px] border border-[#EBEBEB] bg-white">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#EBEBEB] bg-[#F7F7F7]">
                  {["Event", "Type", "Date", "Status"].map((h) => (
                    <th key={h} className="h-9 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#999999]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F0F0]">
                {eventRows.map((event) => (
                  <tr key={event._id} className="hover:bg-[#FAFAFA]">
                    <td className="px-4 py-3 text-[13px] font-medium text-[#111111]">{event.title}</td>
                    <td className="px-4 py-3 text-[13px] text-[#6B6B6B]">{event.type}</td>
                    <td className="px-4 py-3 text-[13px] text-[#6B6B6B]">{new Date(event.event_date).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-[13px] font-medium text-[#3B3B3B]">{event.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-3">
          <div className="rounded-[12px] border border-[#EBEBEB] bg-white p-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.07em] text-[#999999]">Inbox</p>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-[#4d4d4d]">Replies waiting triage</span>
                <span className="font-semibold text-[#111111]">3</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-[#4d4d4d]">Speakers requested call</span>
                <span className="font-semibold text-[#111111]">2</span>
              </div>
            </div>
          </div>

          <div className="rounded-[12px] border border-[#EBEBEB] bg-white p-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.07em] text-[#999999]">Next actions</p>
            <ol className="mt-3 space-y-2">
              {[
                "Approve spring panel shortlist",
                "Follow up with 4 pending speakers",
                "Lock venue details by Friday",
              ].map((action, i) => (
                <li key={action} className="flex items-baseline gap-2 text-[13px]">
                  <span className="shrink-0 font-medium text-[#BBBBBB]">{i + 1}.</span>
                  <span className="text-[#4d4d4d]">{action}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </DashboardPageShell>
  );
}
