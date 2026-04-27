/**
 * Pure helpers for the composer-attached approval prompt.
 *
 * Issue #42 moves pending approvals out of the transcript and into a compact
 * surface anchored above the message composer with three CTAs:
 *   - Yes
 *   - No
 *   - Tell me something else
 *
 * The selection rules, CTA → decision mapping, draft seeding, and the
 * single-flight decision wrapper all live here so they can be unit tested
 * without rendering React.
 */

import type { AgentApproval } from "./types";
import { extractInnerPayload } from "./approvalPayload";

/**
 * Default helper text seeded into the composer when the user clicks
 * "Tell me something else" with an empty draft. Only used when there is no
 * existing draft so we never overwrite user input.
 */
export const TELL_ME_SOMETHING_ELSE_DRAFT = "Tell me something else I can do instead.";

/**
 * Pick the single approval that should drive the composer prompt.
 *
 * Only pending approvals are eligible. The newest pending approval (by
 * `createdAt`) wins so a fresh approval supersedes a stale one without
 * pushing multiple cards into view. Returns `null` when no pending approval
 * exists.
 */
export function getActiveComposerApproval(
  approvals: AgentApproval[],
): AgentApproval | null {
  let active: AgentApproval | null = null;
  for (const approval of approvals) {
    if (approval.status !== "pending") continue;
    if (!active || approval.createdAt > active.createdAt) {
      active = approval;
    }
  }
  return active;
}

/**
 * Count the pending approvals so the prompt can show a passive
 * "+N more pending" affordance for any older approvals it isn't actioning.
 */
export function countPendingApprovals(approvals: AgentApproval[]): number {
  let count = 0;
  for (const approval of approvals) {
    if (approval.status === "pending") count += 1;
  }
  return count;
}

export interface ApprovalSummary {
  /** Short, human-readable headline. Never raw JSON. */
  title: string;
  /** Optional one-line subtitle pulled from a couple of payload fields. */
  detail?: string;
}

const TITLE_PAYLOAD_KEYS = ["title", "name", "subject", "room_label"] as const;
const DETAIL_PAYLOAD_KEYS = [
  "event_date",
  "event_time",
  "location",
  "email",
  "firstname",
  "lastname",
  "booked_date",
  "booked_time",
] as const;

function stringifyShort(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

/**
 * Produce a short headline for the approval. The headline starts from the
 * runtime-supplied `requestedAction` and, when payload data offers a clear
 * title-ish field, appends it after a separator. Identifier-shaped fields
 * such as `event_id` are intentionally not surfaced as the primary title.
 */
export function summarizeApproval(approval: AgentApproval): ApprovalSummary {
  const inner = extractInnerPayload(approval.proposedPayload);
  const baseTitle = approval.requestedAction.trim() || "Approval required";

  let payloadTitle: string | null = null;
  for (const key of TITLE_PAYLOAD_KEYS) {
    payloadTitle = stringifyShort(inner[key]);
    if (payloadTitle) break;
  }

  const details: string[] = [];
  for (const key of DETAIL_PAYLOAD_KEYS) {
    const piece = stringifyShort(inner[key]);
    if (piece) details.push(piece);
    if (details.length >= 2) break;
  }

  return {
    title: payloadTitle ? `${baseTitle} · ${payloadTitle}` : baseTitle,
    detail: details.length > 0 ? details.join(" · ") : undefined,
  };
}

/**
 * Decide what should appear in the composer textarea after the user clicks
 * "Tell me something else". A non-empty existing draft is preserved verbatim
 * so we never trample user input. Otherwise the helper text is seeded so the
 * user sees a meaningful starting point.
 */
export function buildTellMeSomethingElseDraft(existingDraft: string): string {
  if (existingDraft.trim().length > 0) return existingDraft;
  return TELL_ME_SOMETHING_ELSE_DRAFT;
}

export type ComposerCta = "yes" | "no" | "tell_me_something_else";

/**
 * Map a CTA to the underlying approval decision sent to the runtime.
 * Both "no" and "tell me something else" reject the approval; the difference
 * is purely in the post-submit composer behavior.
 */
export function decisionForCta(cta: ComposerCta): "approved" | "rejected" {
  return cta === "yes" ? "approved" : "rejected";
}

/**
 * Single-flight wrapper around the approval submit call. Suppresses duplicate
 * submissions while a request is in flight, then notifies the parent on
 * success. Errors are intentionally not swallowed — callers can attach an
 * `onError` to surface them, but the loading flag is always cleared in the
 * `finally` block.
 */
export async function runDecision(args: {
  approvalId: string;
  decision: "approved" | "rejected";
  submit: (approvalId: string, decision: "approved" | "rejected") => Promise<void>;
  isLoading: boolean;
  setLoading: (next: boolean) => void;
  onResolved?: (decision: "approved" | "rejected") => void | Promise<void>;
  onError?: (error: unknown) => void;
}): Promise<void> {
  if (args.isLoading) return;
  args.setLoading(true);
  try {
    await args.submit(args.approvalId, args.decision);
    await args.onResolved?.(args.decision);
  } catch (error) {
    args.onError?.(error);
  } finally {
    args.setLoading(false);
  }
}
