/**
 * Shared helpers for extracting and formatting approval payload fields.
 *
 * Used by both the pending approval surfaces (ApprovalCard, PendingApprovalBar)
 * and the resolved approval receipt (ResolvedApprovalCard) so a single place
 * decides field labels, value formatting, and which fields to surface.
 *
 * The raw `proposedPayload` shape is unchanged — these helpers are presentation
 * only and do not mutate state or network contracts.
 */

export const FIELD_LABELS: Record<string, string> = {
  title: "Event Name",
  event_date: "Date",
  event_time: "Start Time",
  event_end_time: "End Time",
  location: "Location",
  event_type: "Event Type",
  description: "Description",
  status: "Status",
  needs_outreach: "Needs Outreach",
  target_profile: "Target Audience",
  speaker_confirmed: "Speaker Confirmed",
  room_confirmed: "Room Confirmed",
  event_id: "Event ID",
  firstname: "First Name",
  lastname: "Last Name",
  email: "Email",
  record_id: "Record ID",
  contact_source: "Contact Source",
  contact_type: "Contact Type",
  // OnceHub room booking
  slot_start_epoch_ms: "Slot Start",
  duration_minutes: "Duration",
  num_attendees: "Attendees",
  room_label: "Room",
  booked_date: "Date",
  booked_time: "Start Time",
  booked_end_time: "End Time",
  page_url: "Booking Page",
};

// Keys whose values can be long enough to warrant clamping in the receipt UI.
const LONG_TEXT_KEYS = new Set(["description", "summary", "notes"]);

// Keys that should be interpreted as a date (YYYY-MM-DD or full ISO string).
const DATE_KEYS = new Set(["event_date", "date"]);

// YYYY-MM-DD without a time/zone component. `new Date()` would parse this as
// UTC midnight, which can display as the previous day in negative-UTC zones.
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface ApprovalField {
  key: string;
  label: string;
  /** The original value as a primitive string for editing/diffing. */
  rawValue: string;
  /** A friendly value for display (e.g. "Yes", "Apr 30, 2026"). */
  displayValue: string;
  /** True when the value may be long enough to clamp by default. */
  isLong: boolean;
}

/**
 * Pull the inner tool_input out of an approval payload, falling back to the
 * payload itself when the runtime hasn't wrapped it. Returns an empty object
 * when the payload shape is unrecognised so callers can iterate safely.
 */
export function extractInnerPayload(
  payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {};
  const wrapped = (payload.payload as Record<string, unknown> | undefined)?.tool_input;
  if (wrapped && typeof wrapped === "object") {
    return wrapped as Record<string, unknown>;
  }
  return payload;
}

/**
 * Format a single field value into a friendly display string.
 * Booleans become Yes/No. Date-like keys with a parseable string are formatted
 * with the same locale style used elsewhere in the dashboard.
 * Other values are stringified.
 */
export function formatFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (key === "slot_start_epoch_ms") {
      try {
        return new Intl.DateTimeFormat("en-US", {
          weekday: "short", month: "short", day: "numeric",
          hour: "numeric", minute: "2-digit", hour12: true,
          timeZone: "America/New_York",
        }).format(new Date(value));
      } catch { return String(value); }
    }
    if (key === "duration_minutes") {
      if (value < 60) return `${value} min`;
      const hours = Math.floor(value / 60);
      const rem = value % 60;
      return rem === 0 ? `${hours} hr` : `${hours} hr ${rem} min`;
    }
    return String(value);
  }

  if (typeof value === "string") {
    if (DATE_KEYS.has(key)) {
      const dateOnly = DATE_ONLY_PATTERN.exec(value);
      if (dateOnly) {
        // Construct in local time so the calendar date never drifts a day
        // across timezones. month is 0-indexed.
        const [, y, m, d] = dateOnly;
        const local = new Date(Number(y), Number(m) - 1, Number(d));
        return local.toLocaleDateString();
      }
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString();
      }
    }
    return value;
  }

  // Arrays / nested objects — render as compact JSON so the receipt stays
  // readable even when an unexpected shape lands in the payload.
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Convert an approval payload into an ordered list of labelled fields, ready
 * for rendering as a definition list. Empty/null values are omitted.
 */
export function extractApprovalFields(
  payload: Record<string, unknown> | null | undefined,
): ApprovalField[] {
  const inner = extractInnerPayload(payload);
  return Object.entries(inner)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([key, value]) => {
      const rawString =
        typeof value === "boolean"
          ? value
            ? "Yes"
            : "No"
          : typeof value === "object"
            ? JSON.stringify(value)
            : String(value);
      return {
        key,
        label: FIELD_LABELS[key] ?? key,
        rawValue: rawString,
        displayValue: formatFieldValue(key, value),
        isLong: LONG_TEXT_KEYS.has(key),
      };
    });
}
