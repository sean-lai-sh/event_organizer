/**
 * Stable-prefix markdown preview helper for streaming assistant text.
 *
 * Splits an in-progress markdown stream into two pieces:
 *
 *   - `stableMarkdown`: complete, newline-terminated content that lives outside
 *     any open fenced code block — safe to render through the full markdown
 *     pipeline. Each stabilized line includes its terminating "\n", so the
 *     concatenation `stableMarkdown + unstableTail` is exactly equal to the
 *     original input for every input.
 *   - `unstableTail`: the trailing partial line, plus everything inside any
 *     currently-open code fence. Rendered as plain text until more tokens
 *     arrive.
 *
 * Invariants:
 *   - `stableMarkdown + unstableTail === raw` for every input. The terminating
 *     "\n" of each stable line lives at the end of `stableMarkdown`.
 *   - Already-stable content never moves back into the tail as more text
 *     arrives — the boundary advances monotonically.
 *   - A line only becomes stable once it is followed by a newline AND the
 *     fence state is balanced through that line. Open code fences hold the
 *     entire fenced segment in the tail until the closing fence arrives.
 */
export function stabilizeMarkdownPreview(raw: string): {
  stableMarkdown: string;
  unstableTail: string;
} {
  if (!raw) {
    return { stableMarkdown: "", unstableTail: "" };
  }

  const lines = raw.split("\n");

  // The last entry from `split("\n")` is the trailing partial line — it has no
  // "\n" after it in `raw`. Lines [0..completeCount-1] are complete (each is
  // followed by "\n" in `raw`).
  const completeCount = lines.length - 1;

  // Walk the complete lines, tracking fence state per CommonMark rules:
  //   - An opener is a line of up to 3 leading spaces/tabs, then 3+ backticks,
  //     optionally followed by an info string.
  //   - A closer must use the same character with at least as many backticks
  //     as the opener AND have nothing but whitespace after the backticks.
  //     A line like ```ts inside an open fence is therefore NOT a closer.
  //
  // The last index where the fence is closed is the safe boundary; anything
  // past it must stay in the tail (either still partial or still fenced).
  let insideFence = false;
  let openerLen = 0;
  let safeEnd = 0;
  for (let i = 0; i < completeCount; i++) {
    const line = lines[i];
    if (!insideFence) {
      const opener = matchFenceOpener(line);
      if (opener !== null) {
        insideFence = true;
        openerLen = opener;
      }
    } else if (isFenceCloser(line, openerLen)) {
      insideFence = false;
      openerLen = 0;
    }
    if (!insideFence) {
      safeEnd = i + 1;
    }
  }

  // Each stable line consumes a trailing "\n" in `raw`, so we attach one per
  // stabilized line. The unstable tail is whatever's left, joined with "\n".
  const stableMarkdown =
    safeEnd > 0 ? lines.slice(0, safeEnd).join("\n") + "\n" : "";
  const unstableTail = lines.slice(safeEnd).join("\n");

  return { stableMarkdown, unstableTail };
}

const FENCE_OPENER = /^[ \t]{0,3}(`{3,})/;
const FENCE_CLOSER = /^[ \t]{0,3}(`{3,})[ \t]*$/;

// Returns the opener fence length, or null if the line isn't an opener.
function matchFenceOpener(line: string): number | null {
  const m = FENCE_OPENER.exec(line);
  return m ? m[1].length : null;
}

// A closer must match the opener char (always backtick here), use ≥ openerLen
// backticks, and have nothing but optional whitespace after the run.
function isFenceCloser(line: string, openerLen: number): boolean {
  const m = FENCE_CLOSER.exec(line);
  return !!m && m[1].length >= openerLen;
}
