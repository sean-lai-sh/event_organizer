/**
 * Server-only: candidate deduplication hash.
 *
 * Kept in its own file so the Node.js `crypto` import never gets
 * bundled into client code by Turbopack.
 *
 * Only import this from API routes or other server-side modules.
 */

import { createHash } from "crypto";

/**
 * Compute a canonical dedup hash for a candidate.
 * Uses normalized email (preferred) or normalized name + linkedin URL.
 */
export function hashCandidate(opts: {
  email?: string;
  linkedinUrl?: string;
  fullName: string;
}): string {
  const email = opts.email?.trim().toLowerCase();
  const linkedin = opts.linkedinUrl?.trim().toLowerCase().replace(/\/$/, "");
  const name = opts.fullName.trim().toLowerCase().replace(/\s+/g, " ");
  const key = email || linkedin || name;
  return createHash("sha256").update(key).digest("hex");
}
