import { test } from "node:test";
import assert from "node:assert/strict";
import { CharKind, wikilinkKinds } from "../src/backlinks/wikilinkSyntax";

/** Renders the kinds as text: syntax dropped, link words in <>. */
function shown(text: string): string {
  const kinds = wikilinkKinds(text);
  let out = "";
  for (let i = 0; i < text.length; i++) {
    if (kinds[i] === CharKind.Syntax) continue;
    const opens = kinds[i] === CharKind.Link && kinds[i - 1] !== CharKind.Link;
    const closes = kinds[i] === CharKind.Link && kinds[i + 1] !== CharKind.Link;
    out += (opens ? "<" : "") + text[i] + (closes ? ">" : "");
  }
  return out;
}

test("shows a link's note name without brackets", () => {
  assert.equal(shown("examples such as [[Canva]] and Zapier"), "examples such as <Canva> and Zapier");
});

test("shows an alias in place of the target", () => {
  assert.equal(shown("see [[Cognitive Operating Model|COM]] here"), "see <COM> here");
});

test("drops heading and block references, and the embed mark", () => {
  assert.equal(shown("[[Canva#History]] and ![[Chart.png]] and [[Note^abc]]"), "<Canva> and <Chart.png> and <Note>");
});

test("handles several links and names with punctuation", () => {
  assert.equal(
    shown("[[KPMG]] maps into [[(Report) Forrester Wave, Agentic Control Planes, Q4 2026]]."),
    "<KPMG> maps into <(Report) Forrester Wave, Agentic Control Planes, Q4 2026>."
  );
});

test("leaves a link cut short by the excerpt, and empty brackets, as written", () => {
  assert.equal(shown("as [[Can..."), "as [[Can...");
  assert.equal(shown("...va]] said"), "...va]] said");
  assert.equal(shown("empty [[]] stays"), "empty [[]] stays");
});
