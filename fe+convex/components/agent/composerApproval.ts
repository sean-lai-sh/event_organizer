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
 * Outcome of a `runDecision` call. Callers branch on `status` to decide
 * whether the rejection / approval actually reached the backend before
 * triggering follow-on UI behavior such as focusing the composer.
 *
 * - `submitted`: `submit` resolved successfully and `onResolved` ran.
 * - `skipped`:   the lock was already held; no submit was attempted.
 * - `failed`:    `submit` rejected; `onError` was invoked (if provided).
 */
export interface DecisionResult {
  status: "submitted" | "skipped" | "failed";
  decision?: "approved" | "rejected";
  error?: unknown;
}

/**
 * Single-flight wrapper around the approval submit call.
 *
 * Gating uses a synchronous ref-shaped lock so two clicks dispatched in the
 * same React event tick — before any reactive `setLoading` re-render lands —
 * cannot both pass through. The optional `setLoading` setter is purely for UI
 * feedback (button opacity, etc.) and is not part of the gating decision.
 *
 * Errors from `submit` are reported via the returned `DecisionResult` and via
 * `onError` if supplied; this function does not re-throw, so callers can rely
 * on it never rejecting. The lock and `setLoading` are always released in
 * the `finally` block.
 */
export async function runDecision(args: {
  approvalId: string;
  decision: "approved" | "rejected";
  submit: (
    approvalId: string,
    decision: "approved" | "rejected",
    overrideArgs?: Record<string, unknown>,
  ) => Promise<void>;
  /**
   * Mutable ref holding the in-flight flag. Checked and set synchronously so
   * two click handlers fired in the same tick cannot both pass the gate.
   */
  lock: { current: boolean };
  setLoading?: (next: boolean) => void;
  onResolved?: (decision: "approved" | "rejected") => void | Promise<void>;
  onError?: (error: unknown) => void;
  /** Optional field overrides to merge into the tool payload before execution. */
  overrideArgs?: Record<string, unknown>;
}): Promise<DecisionResult> {
  if (args.lock.current) return { status: "skipped" };
  args.lock.current = true;
  args.setLoading?.(true);
  try {
    await args.submit(args.approvalId, args.decision, args.overrideArgs);
    await args.onResolved?.(args.decision);
    return { status: "submitted", decision: args.decision };
  } catch (error) {
    args.onError?.(error);
    return { status: "failed", error };
  } finally {
    args.lock.current = false;
    args.setLoading?.(false);
  }
}
