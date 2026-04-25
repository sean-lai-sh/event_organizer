/**
 * Stable-prefix markdown preview helper for streaming assistant text.
 *
 * Splits an in-progress markdown stream into two pieces:
 *
 *   - `stableMarkdown`: complete, newline-terminated content that lives outside
 *     any open fenced code block — safe to render through the full markdown
 *     pipeline.
 *   - `unstableTail`: the trailing partial line, plus everything inside any
 *     currently-open code fence. Rendered as plain text until more tokens
 *     arrive.
 *
 * Invariants:
 *   - `stableMarkdown + (stableMarkdown && unstableTail ? "\n" : "") + unstableTail`
 *     reconstructs the original text exactly when the stable portion is
 *     non-empty (because the newline that terminated the last stable line is
 *     consumed by the join boundary). When `stableMarkdown` is empty, the
 *     unstable tail equals the original input.
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
  const endsWithNewline = raw.endsWith("\n");

  // Lines [0..completeCount-1] are complete (followed by a "\n" in `raw`).
  // The remaining slice — `lines[completeCount..]` joined by "\n" — is the
  // trailing partial fragment (and is "" when raw ends with a newline).
  const completeCount = endsWithNewline ? lines.length - 1 : lines.length - 1;

  // Walk the complete lines, tracking fence state. The last index where the
  // fence is closed is the safe boundary; anything past it must stay in the
  // tail because either the line is partial or we're still inside a fence.
  let insideFence = false;
  let safeEnd = 0;
  for (let i = 0; i < completeCount; i++) {
    if (isFenceLine(lines[i])) {
      insideFence = !insideFence;
    }
    if (!insideFence) {
      safeEnd = i + 1;
    }
  }

  const stableLines = lines.slice(0, safeEnd);
  const tailLines = lines.slice(safeEnd);

  return {
    stableMarkdown: stableLines.join("\n"),
    unstableTail: tailLines.join("\n"),
  };
}

function isFenceLine(line: string): boolean {
  return line.trimStart().startsWith("```");
}
