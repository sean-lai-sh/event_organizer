// Shared formatters for OnceHub booking fields rendered inside approval UI.
// Approval cards and the pending-approval bar both surface the same raw
// `slot_start_epoch_ms` / `duration_minutes` values; this module is the
// single source of truth for how they render to the user.

const NEW_YORK_TZ = "America/New_York";

export function formatSlotStart(epochMs: number): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: NEW_YORK_TZ,
    }).format(new Date(epochMs));
  } catch {
    return String(epochMs);
  }
}

export function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hours} hr` : `${hours} hr ${rem} min`;
}

// Returns a humanized string for known OnceHub fields, or null if the key
// is not one of them. Callers fall back to their own default formatting
// (e.g. boolean / generic toString) when this returns null.
export function formatOnceHubFieldValue(key: string, value: unknown): string | null {
  if (key === "slot_start_epoch_ms" && typeof value === "number") {
    return formatSlotStart(value);
  }
  if (key === "duration_minutes" && typeof value === "number") {
    return formatDuration(value);
  }
  return null;
}
