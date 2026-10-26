import { test } from "vitest";
import assert from "node:assert/strict";
import {
  collectMentions,
  displayNames,
  LONG_PASSAGE,
  passageMarkdown,
  withoutEmbeds,
  type LinkIndex,
  type NoteCache,
  type Span,
} from "../src/mentions/mentionIndex";

/** A span over `text` from the first occurrence of `needle`. */
function span(text: string, needle: string, from = 0): Span {
  const start = text.indexOf(needle, from);
  assert.ok(start >= 0, `"${needle}" is in the text`);
  const loc = (offset: number) => ({ line: text.slice(0, offset).split("\n").length - 1, offset });
  return { start: loc(start), end: loc(start + needle.length) };
}

/** A vault where every link "X" resolves to "X.md" when that note exists, and "Target" always resolves. */
function index(notes: Record<string, NoteCache>): LinkIndex {
  const resolve = (link: string) => {
    const path = `${link.split("#")[0]}.md`;
    return path in notes || path === "Target.md" ? path : null;
  };
  return {
    sourcesOf: (target) =>
      Object.keys(notes).filter((source) =>
        [...(notes[source].links ?? []), ...(notes[source].embeds ?? []), ...(notes[source].frontmatterLinks ?? [])].some(
          ({ link }) => resolve(link) === target
        )
      ),
    cacheOf: (path) => notes[path] ?? null,
    resolve,
  };
}

const TEXT = "---\nrelated: \"[[Target]]\"\n---\nFirst paragraph with [[Target]] and [[Target|again]].\n\n- item one\n- item [[Target#Part]] two\n\n> [!note] Callout title\n> body with ![[Target]]\n";

function cacheFor(text: string): NoteCache {
  return {
    frontmatterLinks: [{ link: "Target" }],
    links: [
      { link: "Target", position: span(text, "[[Target]]", text.indexOf("First")) },
      { link: "Target", position: span(text, "[[Target|again]]") },
      { link: "Target#Part", position: span(text, "[[Target#Part]]") },
    ],
    embeds: [{ link: "Target", position: span(text, "![[Target]]") }],
    sections: [
      { type: "yaml", position: span(text, "---\nrelated: \"[[Target]]\"\n---") },
      { type: "paragraph", position: span(text, "First paragraph with [[Target]] and [[Target|again]].") },
      { type: "list", position: span(text, "- item one\n- item [[Target#Part]] two") },
      { type: "callout", position: span(text, "> [!note] Callout title\n> body with ![[Target]]") },
    ],
    listItems: [{ position: span(text, "- item one") }, { position: span(text, "- item [[Target#Part]] two") }],
  };
}

test("a note that links from its text gives one passage per block, in order", () => {
  const { citations, propertyLinks } = collectMentions(index({ "Source.md": cacheFor(TEXT) }), "Target.md");
  assert.equal(propertyLinks.length, 0);
  assert.equal(citations.length, 1);
  const shown = citations[0].passages.map((passage) => passageMarkdown(TEXT, passage));
  assert.deepEqual(shown, [
    "First paragraph with [[Target]] and [[Target|again]].",
    "- item [[Target#Part]] two",
    "> [!note] Callout title\n> body with [[Target]]",
  ]);
  assert.equal(citations[0].passages[0].line, 3);
});

test("a note whose only links are in its properties is a property link", () => {
  const { citations, propertyLinks } = collectMentions(
    index({
      "Props.md": { frontmatterLinks: [{ link: "Target" }] },
      "Other.md": { frontmatterLinks: [{ link: "Elsewhere" }] },
    }),
    "Target.md"
  );
  assert.equal(citations.length, 0);
  assert.deepEqual(propertyLinks, [{ path: "Props.md", name: "Props" }]);
});

test("a note that links to itself is left out, and notes sort by name", () => {
  const line = "see [[Target]]";
  const cache = (text: string): NoteCache => ({ links: [{ link: "Target", position: span(text, "[[Target]]") }] });
  const { citations } = collectMentions(
    index({ "b/Zed.md": cache(line), "Alpha.md": cache(line), "Target.md": cache(line) }),
    "Target.md"
  );
  assert.deepEqual(citations.map((citation) => citation.name), ["Alpha", "Zed"]);
});

test("a long passage keeps only the lines around its link", () => {
  const filler = Array.from({ length: 60 }, (_, i) => `line ${i} ${"x".repeat(40)}`);
  filler[30] = "the line with [[Target]]";
  const text = filler.join("\n");
  const passage = { from: 0, to: text.length, link: text.indexOf("[[Target]]"), line: 30 };
  assert.ok(text.length > LONG_PASSAGE);
  assert.deepEqual(passageMarkdown(text, passage).split("\n"), filler.slice(28, 33));
});

test("embeds become links, so a passage never pulls in a note or an image", () => {
  assert.equal(withoutEmbeds("![[Note]] and ![alt](pic.png) and [[Link]]"), "[[Note]] and [alt](pic.png) and [[Link]]");
});

test("notes that share a file name show their paths", () => {
  const names = displayNames(["a/Same.md", "b/Same.md", "c/Other.md"]);
  assert.deepEqual([...names.values()], ["a/Same", "b/Same", "Other"]);
});
