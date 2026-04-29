export type InboxFilter = "all" | "needs_review" | "awaiting_member_reply" | "resolved";

export type OutreachInboxThread = {
  _id: string;
  attio_record_id: string;
  attio_speakers_entry_id?: string | null;
  response?: string | null;
  inbound_state?: string | null;
  inbound_state_label?: string | null;
  event_id?: string;
  event_name: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_identifier?: string | null;
  message_count: number;
  last_activity_at: number;
};

export const INBOX_FILTERS: InboxFilter[] = [
  "all",
  "needs_review",
  "awaiting_member_reply",
  "resolved",
];

export function formatInboundStateLabel(state?: string | null) {
  if (state === "awaiting_member_reply") return "Awaiting Reply";
  if (state === "resolved") return "Resolved";
  return "Needs Review";
}

export function formatInboxFilterLabel(filter: InboxFilter) {
  if (filter === "all") return "All";
  return formatInboundStateLabel(filter);
}

export function getThreadContactIdentifier(
  thread: Pick<
    OutreachInboxThread,
    "attio_record_id" | "contact_identifier" | "contact_name" | "contact_email"
  >
) {
  return (
    thread.contact_identifier ??
    thread.contact_name ??
    thread.contact_email ??
    thread.attio_record_id
  );
}

export function getThreadContactLine(
  thread: Pick<
    OutreachInboxThread,
    "attio_record_id" | "contact_identifier" | "contact_name" | "contact_email"
  >
) {
  if (thread.contact_name && thread.contact_email) {
    return `${thread.contact_name} / ${thread.contact_email}`;
  }
  return getThreadContactIdentifier(thread);
}

export function buildOutreachThreadHref(id: string) {
  return `/dashboard/communications/${id}`;
}

export function getThreadStatusLabel(
  thread: Pick<OutreachInboxThread, "inbound_state" | "inbound_state_label">
) {
  return thread.inbound_state_label ?? formatInboundStateLabel(thread.inbound_state);
}

export function filterThreadsByState(
  threads: OutreachInboxThread[],
  filter: InboxFilter
) {
  if (filter === "all") return threads;
  return threads.filter((thread) => (thread.inbound_state ?? "needs_review") === filter);
}

export function matchesThreadSearch(
  thread: Pick<
    OutreachInboxThread,
    "attio_record_id" | "contact_identifier" | "contact_name" | "contact_email" | "event_name"
  >,
  search: string
) {
  const query = search.trim().toLowerCase();
  if (!query) return true;

  return [
    thread.event_name,
    thread.contact_name ?? "",
    thread.contact_email ?? "",
    thread.contact_identifier ?? "",
    thread.attio_record_id,
  ].some((value) => value.toLowerCase().includes(query));
}

export function selectVisibleThreads(
  threads: OutreachInboxThread[],
  filter: InboxFilter,
  search: string
) {
  return filterThreadsByState(threads, filter).filter((thread) =>
    matchesThreadSearch(thread, search)
  );
}

export function toInboxRowModel(thread: OutreachInboxThread) {
  return {
    id: thread._id,
    title: thread.event_name,
    contactLine: getThreadContactLine(thread),
    statusLabel: getThreadStatusLabel(thread),
    href: buildOutreachThreadHref(thread._id),
    messageLabel: `${thread.message_count} message${thread.message_count === 1 ? "" : "s"}`,
  };
}
