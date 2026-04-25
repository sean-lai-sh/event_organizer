/**
 * Tests for stabilizeMarkdownPreview — the stable-prefix splitter that lets
 * streaming assistant text render as markdown without churn.
 *
 * Sections:
 *   1. basic completeness — full vs. partial lines
 *   2. fenced code blocks — open fences pin the tail
 *   3. headings, lists, tables — line-completeness rules
 *   4. monotonicity — already-stable content stays stable
 *   5. convergence — preview reconstructs the original input
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

  test("a single newline-terminated line becomes stable", () => {
    expect(stabilizeMarkdownPreview("Hello\n")).toEqual({
      stableMarkdown: "Hello",
      unstableTail: "",
    });
  });

  test("complete lines stabilize, trailing partial line stays in tail", () => {
    expect(stabilizeMarkdownPreview("First line\nSecond line\nThird par")).toEqual({
      stableMarkdown: "First line\nSecond line",
      unstableTail: "Third par",
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
      stableMarkdown: "intro line",
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
      stableMarkdown: "```ts\nconst x = 1\n```",
      unstableTail: "",
    });
  });

  test("content after a closed fence stabilizes once its line is complete", () => {
    const raw = "```ts\nfoo\n```\nAfter fence\n";
    expect(stabilizeMarkdownPreview(raw)).toEqual({
      stableMarkdown: "```ts\nfoo\n```\nAfter fence",
      unstableTail: "",
    });
  });

  test("a second open fence pins the new fenced segment to the tail", () => {
    const raw = "```ts\nfoo\n```\nGap\n```py\nbar";
    expect(stabilizeMarkdownPreview(raw)).toEqual({
      stableMarkdown: "```ts\nfoo\n```\nGap",
      unstableTail: "```py\nbar",
    });
  });

  test("indented fence markers still toggle fence state", () => {
    const raw = "  ```ts\nfoo\n  ```\n";
    expect(stabilizeMarkdownPreview(raw)).toEqual({
      stableMarkdown: "  ```ts\nfoo\n  ```",
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
      stableMarkdown: "# Heading",
      unstableTail: "",
    });
  });

  test("partial list item stays in the unstable tail", () => {
    const raw = "- one\n- two\n- thr";
    expect(stabilizeMarkdownPreview(raw)).toEqual({
      stableMarkdown: "- one\n- two",
      unstableTail: "- thr",
    });
  });

  test("ordered list items stabilize line by line", () => {
    const raw = "1. alpha\n2. beta\n3. ga";
    expect(stabilizeMarkdownPreview(raw)).toEqual({
      stableMarkdown: "1. alpha\n2. beta",
      unstableTail: "3. ga",
    });
  });

  test("partial table row stays in the unstable tail", () => {
    const raw = "| col a | col b |\n| ----- | ----- |\n| 1 | ";
    expect(stabilizeMarkdownPreview(raw)).toEqual({
      stableMarkdown: "| col a | col b |\n| ----- | ----- |",
      unstableTail: "| 1 | ",
    });
  });

  test("complete table row stabilizes once its line ends", () => {
    const raw = "| col a | col b |\n| ----- | ----- |\n| 1 | 2 |\n";
    expect(stabilizeMarkdownPreview(raw)).toEqual({
      stableMarkdown: "| col a | col b |\n| ----- | ----- |\n| 1 | 2 |",
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
});

/* ══════════════════════════════════════════════════════════════════════════ */
/*  5. convergence                                                           */
/*                                                                            */
/*  The preview must lossless-reconstruct the input: stable + boundary-\n + */
/*  tail equals the raw stream. This guarantees no character is dropped or  */
/*  duplicated between preview and the final rendered message.              */
/* ══════════════════════════════════════════════════════════════════════════ */

describe("stabilizeMarkdownPreview — convergence", () => {
  function recombine(raw: string): string {
    const { stableMarkdown, unstableTail } = stabilizeMarkdownPreview(raw);
    if (!stableMarkdown) return unstableTail;
    if (!unstableTail) {
      // The trailing newline that separated stable from tail was consumed when
      // tail was sliced as []. Reattach it so we recover the original input.
      return raw.endsWith("\n") ? `${stableMarkdown}\n` : stableMarkdown;
    }
    return `${stableMarkdown}\n${unstableTail}`;
  }

  const cases = [
    "",
    "Hello",
    "Hello\n",
    "First\nSecond\n",
    "First\nSecond\nThird par",
    "# Heading\n\nBody text.\n",
    "intro\n```ts\nconst x = 1\n```\nafter\n",
    "```ts\nconst x = 1\n",
    "- one\n- two\n- thr",
    "| a | b |\n| - | - |\n| 1 | 2 |\n",
  ];

  for (const raw of cases) {
    test(`recombines: ${JSON.stringify(raw)}`, () => {
      expect(recombine(raw)).toBe(raw);
    });
  }
});
