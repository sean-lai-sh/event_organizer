"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "convex/react";
import { DashboardPageShell } from "@/components/dashboard/PageShell";
import { api } from "@/convex/_generated/api";
import { computeKpis, toEventRows } from "./dashboardView";

export default function DashboardPage() {
  const eventsRaw = useQuery(api.events.listEvents, {});

  const kpis = useMemo(() => {
    if (!eventsRaw) return null;
    const speakersConfirmed = eventsRaw.filter((e) => e.speaker_confirmed).length;
    return computeKpis(eventsRaw, { speakersConfirmed });
  }, [eventsRaw]);

  const eventRows = useMemo(
    () => (eventsRaw ? toEventRows(eventsRaw, 3) : null),
    [eventsRaw]
  );

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
        {kpis
          ? kpis.map((k) => (
              <div
                key={k.label}
                className="flex flex-col gap-2 rounded-[18px] border border-[#e8e8e8] bg-[#f4f4f4] p-4"
              >
                <span className="font-sans text-[34px] font-light leading-none tracking-[-0.04em] text-[#1f1f1f]">
                  {k.value}
                </span>
                <span className="text-[13px] font-medium text-[#767676]">{k.label}</span>
              </div>
            ))
          : Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-[88px] animate-pulse rounded-[18px] border border-[#e8e8e8] bg-[#f4f4f4]"
              />
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
            {eventRows === null ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-12 animate-pulse rounded-[8px] border border-[#F0F0F0] bg-[#F7F7F7]"
                  />
                ))}
              </div>
            ) : eventRows.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-[#9B9B9B]">
                No events yet.{" "}
                <Link href="/dashboard/events/new" className="font-medium text-[#111111] underline underline-offset-2">
                  Create your first event.
                </Link>
              </div>
            ) : (
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
                      <td className="px-4 py-3 text-[13px] text-[#6B6B6B]">
                        {event.event_date
                          ? new Date(`${event.event_date}T00:00:00`).toLocaleDateString()
                          : "TBD"}
                      </td>
                      <td className="px-4 py-3 text-[13px] font-medium text-[#3B3B3B]">{event.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-3">
          <div className="rounded-[12px] border border-[#EBEBEB] bg-white p-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.07em] text-[#999999]">Inbox</p>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-[#4d4d4d]">Replies waiting triage</span>
                <span className="font-semibold text-[#111111]">—</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-[#4d4d4d]">Speakers requested call</span>
                <span className="font-semibold text-[#111111]">—</span>
              </div>
            </div>
          </div>

          <div className="rounded-[12px] border border-[#EBEBEB] bg-white p-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.07em] text-[#999999]">Quick links</p>
            <div className="mt-3 space-y-2">
              <Link href="/dashboard/events" className="block text-[13px] text-[#4d4d4d] hover:text-[#111111]">
                All events
              </Link>
              <Link href="/dashboard/speakers" className="block text-[13px] text-[#4d4d4d] hover:text-[#111111]">
                Speakers
              </Link>
              <Link href="/dashboard/communications" className="block text-[13px] text-[#4d4d4d] hover:text-[#111111]">
                Communications
              </Link>
            </div>
          </div>
        </div>
      </section>
    </DashboardPageShell>
  );
}
