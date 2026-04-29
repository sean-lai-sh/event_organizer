export function formatShortDate(value?: string | null) {
  if (!value) return "TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatCompactTimestamp(value?: number | null) {
  if (value == null) return "No activity yet";
  const date = new Date(value);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatSourceLabel(source?: string | null) {
  if (!source) return "unknown";
  return source.replace(/_/g, " ");
}
