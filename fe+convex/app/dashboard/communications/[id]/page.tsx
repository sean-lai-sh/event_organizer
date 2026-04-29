"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import { DashboardPageShell } from "@/components/dashboard/PageShell";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  formatInboundStateLabel,
  getThreadContactIdentifier,
} from "../communicationsView";

function formatDateTime(value?: number | null) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function DetailStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-[16px] border border-[#E8E8E8] bg-[#FFFFFF] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9A9A9A]">
        {label}
      </p>
      <p className="mt-2 text-[16px] font-semibold tracking-[-0.03em] text-[#111111]">{value}</p>
    </div>
  );
}

export default function CommunicationThreadPage() {
  const params = useParams<{ id: string }>();
  const thread = useQuery(api.inboundDashboard.getOutreachThread, {
    id: params.id as Id<"event_outreach">,
  });

  const contactIdentifier = thread
    ? getThreadContactIdentifier(thread)
    : "Loading contact";
  const statusLabel = thread
    ? thread.inbound_state_label ?? formatInboundStateLabel(thread.inbound_state)
    : "Loading status";

  return (
    <DashboardPageShell
      title={thread?.event?.title ?? "Thread Detail"}
      action={
        <Link
          href="/dashboard/communications"
          className="inline-flex items-center gap-2 rounded-full border border-[#E1E1E1] bg-[#FFFFFF] px-3 py-1.5 text-[12px] font-medium text-[#111111] transition hover:bg-[#F6F6F6]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Inbox
        </Link>
      }
    >
      {thread === undefined ? (
        <>
          <section className="h-[128px] animate-pulse rounded-[20px] border border-[#EAEAEA] bg-[#FFFFFF]" />
          <section className="h-[320px] animate-pulse rounded-[20px] border border-[#EAEAEA] bg-[#FFFFFF]" />
        </>
      ) : thread === null ? (
        <section className="rounded-[20px] border border-[#EAEAEA] bg-[#FFFFFF] px-6 py-8 text-center">
          <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-[#111111]">
            Thread not found
          </h2>
          <p className="mt-2 text-[13px] leading-6 text-[#666666]">
            This outreach thread is not available in Convex. Return to Communications and choose a current thread.
          </p>
        </section>
      ) : (
        <>
          <section className="rounded-[20px] border border-[#EAEAEA] bg-[#FFFFFF] px-6 py-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#949494]">
              Outreach Thread
            </p>
            <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.04em] text-[#111111]">
              {contactIdentifier}
            </h2>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-[#666666]">
              <span>{thread.contact_email ?? thread.attio_record_id}</span>
              <span>{thread.event?.title ?? "No linked event"}</span>
              <span>{statusLabel}</span>
              <span>{formatDateTime(thread.last_activity_at)}</span>
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <DetailStat label="Status" value={statusLabel} />
            <DetailStat label="Messages" value={thread.message_count} />
            <DetailStat label="Attio Person" value={thread.attio_record_id} />
            <DetailStat
              label="Speaker Entry"
              value={thread.attio_speakers_entry_id ?? "Not linked"}
            />
          </section>

          <section className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="rounded-[20px] border border-[#EAEAEA] bg-[#FFFFFF] p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9A9A9A]">
                Linked Event
              </p>
              <div className="mt-4 space-y-3 text-[13px] text-[#666666]">
                <div>
                  <p className="font-medium text-[#111111]">Title</p>
                  <p className="mt-1">{thread.event?.title ?? "Unavailable"}</p>
                </div>
                <div>
                  <p className="font-medium text-[#111111]">Date</p>
                  <p className="mt-1">{thread.event?.event_date ?? "Not scheduled"}</p>
                </div>
                <div>
                  <p className="font-medium text-[#111111]">Time</p>
                  <p className="mt-1">{thread.event?.event_time ?? "Not scheduled"}</p>
                </div>
                <div>
                  <p className="font-medium text-[#111111]">Event Status</p>
                  <p className="mt-1">{thread.event?.status ?? "Unknown"}</p>
                </div>
              </div>
            </aside>

            <section className="rounded-[20px] border border-[#EAEAEA] bg-[#FFFFFF]">
              <div className="border-b border-[#EFEFEF] px-5 py-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9F9F9F]">
                  Receipt Timeline
                </p>
                <h3 className="mt-2 text-[18px] font-semibold tracking-[-0.03em] text-[#111111]">
                  Inbound processing history
                </h3>
                <p className="mt-2 text-[13px] leading-6 text-[#6C6C6C]">
                  Chronological receipt records linked to this outreach thread.
                </p>
              </div>

              {thread.receipts.length > 0 ? (
                <div className="px-5 py-4">
                  {thread.receipts.map((receipt, index) => (
                    <div key={receipt._id} className="flex gap-3 py-3">
                      <div className="flex w-8 flex-col items-center">
                        <div className="h-2.5 w-2.5 rounded-full border border-[#D7D7D7] bg-[#111111]" />
                        {index < thread.receipts.length - 1 ? (
                          <div className="mt-2 h-full w-px bg-[#ECECEC]" />
                        ) : null}
                      </div>
                      <div className="flex-1 rounded-[16px] border border-[#F0F0F0] bg-[#FCFCFC] px-4 py-3">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-[#111111]">
                              {receipt.message_id}
                            </p>
                            <p className="mt-1 text-[12px] text-[#7A7A7A]">
                              Received {formatDateTime(receipt.received_at)}
                            </p>
                          </div>
                          <div className="shrink-0 text-left md:text-right">
                            <span className="inline-flex rounded-full border border-[#DADADA] bg-[#FFFFFF] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#444444]">
                              {receipt.status ?? "unknown"}
                            </span>
                            <p className="mt-2 text-[11px] text-[#7A7A7A]">
                              Updated {formatDateTime(receipt.updated_at ?? receipt.completed_at)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-5 py-10 text-center">
                  <h3 className="text-[16px] font-semibold text-[#151515]">No inbound receipts yet</h3>
                  <p className="mt-2 text-[13px] leading-6 text-[#747474]">
                    This thread has not recorded receipt processing metadata in Convex yet.
                  </p>
                </div>
              )}
            </section>
          </section>
        </>
      )}
    </DashboardPageShell>
  );
}
