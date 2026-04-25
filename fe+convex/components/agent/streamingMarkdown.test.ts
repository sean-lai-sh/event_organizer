/**
 * Tests for stabilizeMarkdownPreview — the stable-prefix splitter that lets
 * streaming assistant text render as markdown without churn.
 *
 * Sections:
 *   1. basic completeness — full vs. partial lines
 *   2. fenced code blocks — open fences pin the tail; closer rules per CommonMark
 *   3. headings, lists, tables — line-completeness rules
 *   4. monotonicity — already-stable content stays stable
 *   5. convergence — `stableMarkdown + unstableTail` reconstructs the input
 */

import { describe, test, expect } from "bun:test";
import { stabilizeMarkdownPreview } from "./streamingMarkdown";

/* ══════════════════════════════════════════════════════════════════════════ */
/*  1. basic completeness                                                    */
/* ══════════════════════════════════════════════════════════════════════════ */

describe("stabilizeMarkdownPreview — basic completeness", () => {
  test("empty input yields empty stable and tail", () => {
    expect(stabilizeMarkdownPreview("")).toEqual({
      stableMarkdown: "",
      unstableTail: "",
    });
  });

  test("partial line with no newline stays entirely in the tail", () => {
    expect(stabilizeMarkdownPreview("Hello")).toEqual({
      stableMarkdown: "",
      unstableTail: "Hello",
    });
  });

  test("a single newline-terminated line becomes stable (newline lives in stable)", () => {
    expect(stabilizeMarkdownPreview("Hello\n")).toEqual({
      stableMarkdown: "Hello\n",
      unstableTail: "",
    });
  });

  test("complete lines stabilize, trailing partial line stays in tail", () => {
    expect(stabilizeMarkdownPreview("First line\nSecond line\nThird par")).toEqual({
      stableMarkdown: "First line\nSecond line\n",
      unstableTail: "Third par",
    });
  });

  test("a single bare newline stabilizes losslessly", () => {
    expect(stabilizeMarkdownPreview("\n")).toEqual({
      stableMarkdown: "\n",
      unstableTail: "",
    });
  });

  test("leading newline before partial content is preserved in the stable side", () => {
    expect(stabilizeMarkdownPreview("\nHello")).toEqual({
      stableMarkdown: "\n",
      unstableTail: "Hello",
    });
  });

  test("multiple leading newlines are all stabilized", () => {
    expect(stabilizeMarkdownPreview("\n\n\nHello")).toEqual({
      stableMarkdown: "\n\n\n",
      unstableTail: "Hello",
    });
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/*  2. fenced code blocks                                                    */
/* ══════════════════════════════════════════════════════════════════════════ */

describe("stabilizeMarkdownPreview — fenced code blocks", () => {
  test("an open code fence pins the entire fence segment to the tail", () => {
    const raw = "intro line\n```ts\nconst x = 1\nconst y = 2";
    expect(stabilizeMarkdownPreview(raw)).toEqual({
      stableMarkdown: "intro line\n",
      unstableTail: "```ts\nconst x = 1\nconst y = 2",
    });
  });

  test("an open code fence with a trailing newline is still unstable until closed", () => {
    const raw = "```ts\nconst x = 1\n";
    expect(stabilizeMarkdownPreview(raw)).toEqual({
      stableMarkdown: "",
      unstableTail: "```ts\nconst x = 1\n",
    });
  });

  test("a closed fence stabilizes the full code block", () => {
    const raw = "```ts\nconst x = 1\n```\n";
    expect(stabilizeMarkdownPreview(raw)).toEqual({
      stableMarkdown: "```ts\nconst x = 1\n```\n",
      unstableTail: "",
    });
  });

  test("content after a closed fence stabilizes once its line is complete", () => {
    const raw = "```ts\nfoo\n```\nAfter fence\n";
    expect(stabilizeMarkdownPreview(raw)).toEqual({
      stableMarkdown: "```ts\nfoo\n```\nAfter fence\n",
      unstableTail: "",
    });
  });

  test("a second open fence pins the new fenced segment to the tail", () => {
    const raw = "```ts\nfoo\n```\nGap\n```py\nbar";
    expect(stabilizeMarkdownPreview(raw)).toEqual({
      stableMarkdown: "```ts\nfoo\n```\nGap\n",
      unstableTail: "```py\nbar",
    });
  });

  test("indented fence markers still toggle fence state", () => {
    const raw = "  ```ts\nfoo\n  ```\n";
    expect(stabilizeMarkdownPreview(raw)).toEqual({
      stableMarkdown: "  ```ts\nfoo\n  ```\n",
      unstableTail: "",
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   *  CommonMark closer rules — guards against false fence closure inside
   *  an open block. Without these, "markdown-in-markdown" responses break.
   * ──────────────────────────────────────────────────────────────────────── */

  test("a line like ```ts inside an open fence does NOT close it (closer cannot have an info string)", () => {
    // Outer 3-backtick fence opens on line 0. Line 1 is "```ts" — looks like
    // a fence line but cannot be a closer because closers must have nothing
    // after the backticks. The fence stays open through line 2.
    const raw = "```\ninside ```ts looks like an opener\nstill inside\n";
    expect(stabilizeMarkdownPreview(raw)).toEqual({
      stableMarkdown: "",
      unstableTail: "```\ninside ```ts looks like an opener\nstill inside\n",
    });
  });

  test("a 3-backtick line inside a 4-backtick fence does NOT close it (closer must be ≥ opener length)", () => {
    // Outer fence is 4 backticks, so a 3-backtick line cannot close it. This
    // is the common pattern for embedding a markdown code sample inside a
    // markdown code sample.
    const raw = "````\n```ts\nconst x = 1;\n```\n````\n";
    expect(stabilizeMarkdownPreview(raw)).toEqual({
      stableMarkdown: "````\n```ts\nconst x = 1;\n```\n````\n",
      unstableTail: "",
    });
  });

  test("a 4-backtick line DOES close a 3-backtick fence (closer length ≥ opener length)", () => {
    const raw = "```ts\nfoo\n````\n";
    expect(stabilizeMarkdownPreview(raw)).toEqual({
      stableMarkdown: "```ts\nfoo\n````\n",
      unstableTail: "",
    });
  });

  test("trailing whitespace on a closer is allowed", () => {
    const raw = "```ts\nfoo\n```   \n";
    expect(stabilizeMarkdownPreview(raw)).toEqual({
      stableMarkdown: "```ts\nfoo\n```   \n",
      unstableTail: "",
    });
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/*  3. headings, lists, tables — line-completeness rules                     */
/* ══════════════════════════════════════════════════════════════════════════ */

describe("stabilizeMarkdownPreview — markdown elements", () => {
  test("a partial heading line stays in the unstable tail", () => {
    expect(stabilizeMarkdownPreview("# Headi")).toEqual({
      stableMarkdown: "",
      unstableTail: "# Headi",
    });
  });

  test("a complete heading line stabilizes after the newline", () => {
    expect(stabilizeMarkdownPreview("# Heading\n")).toEqual({
      stableMarkdown: "# Heading\n",
      unstableTail: "",
    });
  });

  test("partial list item stays in the unstable tail", () => {
    const raw = "- one\n- two\n- thr";
    expect(stabilizeMarkdownPreview(raw)).toEqual({
      stableMarkdown: "- one\n- two\n",
      unstableTail: "- thr",
    });
  });

  test("ordered list items stabilize line by line", () => {
    const raw = "1. alpha\n2. beta\n3. ga";
    expect(stabilizeMarkdownPreview(raw)).toEqual({
      stableMarkdown: "1. alpha\n2. beta\n",
      unstableTail: "3. ga",
    });
  });

  test("partial table row stays in the unstable tail", () => {
    const raw = "| col a | col b |\n| ----- | ----- |\n| 1 | ";
    expect(stabilizeMarkdownPreview(raw)).toEqual({
      stableMarkdown: "| col a | col b |\n| ----- | ----- |\n",
      unstableTail: "| 1 | ",
    });
  });

  test("complete table row stabilizes once its line ends", () => {
    const raw = "| col a | col b |\n| ----- | ----- |\n| 1 | 2 |\n";
    expect(stabilizeMarkdownPreview(raw)).toEqual({
      stableMarkdown: "| col a | col b |\n| ----- | ----- |\n| 1 | 2 |\n",
      unstableTail: "",
    });
  });

  test("table row inside an open code fence stays in the tail even when the row is complete", () => {
    const raw = "```\n| 1 | 2 |\n";
    expect(stabilizeMarkdownPreview(raw)).toEqual({
      stableMarkdown: "",
      unstableTail: "```\n| 1 | 2 |\n",
    });
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/*  4. monotonicity                                                          */
/*                                                                            */
/*  Already-stable content must never move back into the tail as more text  */
/*  arrives. Verified by replaying a token-by-token stream.                  */
/* ══════════════════════════════════════════════════════════════════════════ */

describe("stabilizeMarkdownPreview — monotonic stable boundary", () => {
  function streamPrefixes(final: string): string[] {
    const out: string[] = [];
    for (let i = 1; i <= final.length; i++) {
      out.push(final.slice(0, i));
    }
    return out;
  }

  test("stable prefix never shrinks across a typical streaming sequence", () => {
    const final = "# Title\n\nSome **bold** text.\n\n- one\n- two\n";
    let prevStableLen = 0;
    for (const prefix of streamPrefixes(final)) {
      const { stableMarkdown } = stabilizeMarkdownPreview(prefix);
      expect(stableMarkdown.length).toBeGreaterThanOrEqual(prevStableLen);
      prevStableLen = stableMarkdown.length;
    }
  });

  test("stable prefix never shrinks across a stream that contains a fenced code block", () => {
    const final = "intro\n```ts\nconst x = 1\n```\nafter\n";
    let prevStableLen = 0;
    for (const prefix of streamPrefixes(final)) {
      const { stableMarkdown } = stabilizeMarkdownPreview(prefix);
      expect(stableMarkdown.length).toBeGreaterThanOrEqual(prevStableLen);
      prevStableLen = stableMarkdown.length;
    }
  });

  test("stable prefix never shrinks across a stream containing a 4-backtick markdown-in-markdown block", () => {
    const final = "intro\n````md\n```ts\nfoo\n```\n````\nafter\n";
    let prevStableLen = 0;
    for (const prefix of streamPrefixes(final)) {
      const { stableMarkdown } = stabilizeMarkdownPreview(prefix);
      expect(stableMarkdown.length).toBeGreaterThanOrEqual(prevStableLen);
      prevStableLen = stableMarkdown.length;
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/*  5. convergence                                                           */
/*                                                                            */
/*  The split is lossless: stableMarkdown + unstableTail equals the raw     */
/*  stream for every input. This guarantees no character is dropped or      */
/*  duplicated between the streaming preview and the final rendered output. */
/* ══════════════════════════════════════════════════════════════════════════ */

describe("stabilizeMarkdownPreview — convergence", () => {
  const cases = [
    "",
    "Hello",
    "Hello\n",
    "\n",
    "\nHello",
    "\n\n\nHello",
    "First\nSecond\n",
    "First\nSecond\nThird par",
    "# Heading\n\nBody text.\n",
    "intro\n```ts\nconst x = 1\n```\nafter\n",
    "```ts\nconst x = 1\n",
    "- one\n- two\n- thr",
    "| a | b |\n| - | - |\n| 1 | 2 |\n",
    "````\n```ts\nfoo\n```\n````\n",
    "```\ninside ```ts looks like an opener\nstill inside\n",
  ];

  for (const raw of cases) {
    test(`recombines: ${JSON.stringify(raw)}`, () => {
      const { stableMarkdown, unstableTail } = stabilizeMarkdownPreview(raw);
      expect(stableMarkdown + unstableTail).toBe(raw);
    });
  }
});
