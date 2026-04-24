// Shared by ApprovalCard and PendingApprovalBar.

const NEW_YORK_TZ = "America/New_York";

function formatSlotStart(epochMs: number): string {
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

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hours} hr` : `${hours} hr ${rem} min`;
}

export function formatOnceHubFieldValue(key: string, value: unknown): string | null {
  if (key === "slot_start_epoch_ms" && typeof value === "number") {
    return formatSlotStart(value);
  }
  if (key === "duration_minutes" && typeof value === "number") {
    return formatDuration(value);
  }
  return null;
}
