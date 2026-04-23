/**
 * Speaker CRM — shared utility functions (browser-safe, no Node.js built-ins).
 *
 * hashCandidate lives in hash.server.ts so it can use Node's crypto module
 * without being bundled into the browser by Turbopack.
 */

/** Format a 0–10 score for display */
export function formatScore(score: number): string {
  return score.toFixed(1);
}

/** Format confidence as percentage string */
export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

/** Format a date string (YYYY-MM-DD) for display */
export function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

/** Parse tags from a comma-separated string or array */
export function parseTags(input: string | string[]): string[] {
  if (Array.isArray(input)) return input.filter(Boolean);
  return input
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Validate that a string is a plausible LinkedIn URL */
export function isLinkedInUrl(url: string): boolean {
  return /^https?:\/\/(www\.)?linkedin\.com\/in\//.test(url);
}

/** Build a short display label for a candidate */
export function candidateDisplayLabel(opts: {
  fullName: string;
  currentTitle?: string;
  companyName?: string;
}): string {
  const role =
    opts.currentTitle && opts.companyName
      ? `${opts.currentTitle} @ ${opts.companyName}`
      : opts.currentTitle ?? opts.companyName ?? "";

  return role ? `${opts.fullName} · ${role}` : opts.fullName;
}
