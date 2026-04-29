/**
 * dashboardView.ts
 *
 * Pure view-model helpers for the /dashboard page.
 * These functions accept raw Convex query results and return
 * derived display values, keeping the React component free of
 * inline computation logic and making the logic straightforwardly testable.
 */

export type RawEvent = {
  _id: string;
  title: string;
  event_date?: string | null;
  event_type?: string | null;
  status?: string | null;
};

export type KpiRow = {
  label: string;
  value: string;
};

export type EventRow = {
  _id: string;
  title: string;
  event_date: string;
  type: string;
  status: string;
};

/**
 * Derive the four dashboard KPI cards from a list of raw events.
 *
 * - total events     — count of all events
 * - active outreach  — count of events whose status is "outreach"
 * - speakers confirmed — count of events where speaker_confirmed is true
 *   (not available in RawEvent; callers that have the full Doc may cast)
 * - upcoming         — count of events whose date is today or in the future
 */
export function computeKpis(
  events: RawEvent[],
  opts: { today?: string; speakersConfirmed?: number } = {}
): KpiRow[] {
  const totalEvents = events.length;
  const activeOutreach = events.filter((e) => e.status === "outreach").length;
  const speakersConfirmed = opts.speakersConfirmed ?? 0;

  const todayStr = opts.today ?? new Date().toISOString().slice(0, 10);
  const upcoming = events.filter((e) => {
    if (!e.event_date) return false;
    return e.event_date >= todayStr;
  }).length;

  return [
    { label: "total events", value: String(totalEvents) },
    { label: "active outreach", value: String(activeOutreach) },
    { label: "speakers confirmed", value: String(speakersConfirmed) },
    { label: "upcoming", value: String(upcoming) },
  ];
}

/**
 * Format a raw event_date string (YYYY-MM-DD or similar) for display.
 * Returns a locale-formatted date string, or "TBD" when absent or invalid.
 */
export function formatEventDate(value?: string | null): string {
  if (!value) return "TBD";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Capitalise the first letter of a status string.
 */
export function formatStatus(status?: string | null): string {
  if (!status) return "—";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/**
 * Convert raw events into the flattened row shape used in the dashboard table.
 * Accepts an optional `limit` to cap the returned list.
 */
export function toEventRows(events: RawEvent[], limit?: number): EventRow[] {
  const rows: EventRow[] = events.map((e) => ({
    _id: e._id,
    title: e.title,
    event_date: e.event_date ?? "",
    type: e.event_type ?? "—",
    status: formatStatus(e.status),
  }));

  return limit === undefined ? rows : rows.slice(0, limit);
}
