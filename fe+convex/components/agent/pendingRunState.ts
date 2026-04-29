/**
 * Ephemeral module-level store for the pending-run handoff across route
 * transitions.
 *
 * Problem being solved:
 *   When a user types their first message on /agent (no thread), handleSend
 *   creates the thread, calls onThreadCreated (router.push → navigation), and
 *   then tries to call startRun from the OLD ConversationTimeline instance.
 *   The new component mounts with fresh state (isRunning=false, pendingMessage=null)
 *   and shows MessageSkeletons until Convex delivers an update — or shows an
 *   empty state forever if startRun silently failed from the unmounting component.
 *
 * Solution:
 *   Before navigation, the old component stores the pending run here.
 *   The new ConversationTimeline reads it on mount, shows the optimistic UI
 *   immediately, and owns the startRun call (so it can handle errors).
 *
 * Consumed on first read — subsequent navigations to the same thread won't
 * re-trigger a run.
 */

type PendingRun = { threadId: string; message: string };

let _pending: PendingRun | null = null;

export function setPendingRun(threadId: string, message: string): void {
  _pending = { threadId, message };
}

/**
 * Returns the pending message for this threadId and clears the store.
 * Returns null if there is no pending run or the threadId doesn't match.
 */
export function consumePendingRun(threadId: string): string | null {
  if (_pending?.threadId !== threadId) return null;
  const msg = _pending.message;
  _pending = null;
  return msg;
}
