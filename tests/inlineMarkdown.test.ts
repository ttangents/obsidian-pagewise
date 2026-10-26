import { test } from "vitest";
import assert from "node:assert/strict";
import { Style, inlineStyles } from "../src/backlinks/inlineMarkdown";

/** Renders the styles as text: syntax dropped, styled runs tagged, e.g. <hl:word>. */
const TAGS: [number, string][] = [
  [Style.LINK, "link"], [Style.BOLD, "b"], [Style.ITALIC, "i"],
  [Style.HIGHLIGHT, "hl"], [Style.STRIKE, "s"], [Style.CODE, "code"],
];
function shown(text: string): string {
  const styles = inlineStyles(text);
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (styles[i] & Style.SYNTAX) { i++; continue; }
    let j = i;
    while (j < text.length && styles[j] === styles[i]) j++;
    const tags = TAGS.filter(([bit]) => styles[i] & bit).map(([, name]) => name).join("+");
    out += tags ? `<${tags}:${text.slice(i, j)}>` : text.slice(i, j);
    i = j;
  }
  return out;
}

test("wikilinks show their note name or alias", () => {
  assert.equal(shown("such as [[Canva]] and Zapier"), "such as <link:Canva> and Zapier");
  assert.equal(shown("see [[Cognitive Operating Model|COM]]"), "see <link:COM>");
  assert.equal(shown("[[Canva#History]] and ![[Chart.png]]"), "<link:Canva> and <link:Chart.png>");
});

test("highlights, bold, italics and strikethrough lose their markers", () => {
  assert.equal(shown("a ==key point== here"), "a <hl:key point> here");
  assert.equal(shown("**bold** and __bold__"), "<b:bold> and <b:bold>");
  assert.equal(shown("*it* and _it_"), "<i:it> and <i:it>");
  assert.equal(shown("~~gone~~"), "<s:gone>");
});

test("styles nest, including around links", () => {
  assert.equal(shown("==see [[Canva]] now=="), "<hl:see ><link+hl:Canva><hl: now>");
  assert.equal(shown("==**both**=="), "<b+hl:both>");
  assert.equal(shown("**==both==**"), "<b+hl:both>");
});

test("inline code and markdown links", () => {
  assert.equal(shown("run `a ==b==` now"), "run <code:a ==b==> now");
  assert.equal(shown("read [the post](https://example.com) today"), "read <link:the post> today");
});

test("text that only looks like syntax stays as written", () => {
  assert.equal(shown("as [[Can and more"), "as [[Can and more");
  assert.equal(shown("a == b and c == d"), "a == b and c == d");
  assert.equal(shown("snake_case_name and 2 * 3 * 4"), "snake_case_name and 2 * 3 * 4");
  assert.equal(shown("- list item"), "- list item");
  assert.equal(shown("half ==open"), "half ==open");
});

test("backslash escapes show the character, not the backslash", () => {
  assert.equal(shown("\\*not italic\\*"), "*not italic*");
});

test("a link or highlight cut by the excerpt's ellipsis loses its stray half", () => {
  assert.equal(shown("...citizen development advisory]], the AI cost"), "...<link:citizen development advisory>, the AI cost");
  assert.equal(shown("...the Hoya call|Hoya]] said"), "...<link:Hoya> said");
  assert.equal(shown("strategy. ==(Not yet published ..."), "strategy. <hl:(Not yet published> ...");
  assert.equal(shown("see [[Microsoft 365 E7 lic..."), "see <link:Microsoft 365 E7 lic>...");
  assert.equal(shown("...ended here== and **bold** then"), "...<hl:ended here> and <b:bold> then");
});

test("without an ellipsis, unmatched markers stay as written", () => {
  assert.equal(shown("advisory]], the AI"), "advisory]], the AI");
  assert.equal(shown("strategy. ==(Not yet published"), "strategy. ==(Not yet published");
});

test("quote and callout markers at the start of a line hide, and the text stays", () => {
  assert.equal(shown("> [!success] This note is a part of the project [[Evaluative Research]]."), "This note is a part of the project <link:Evaluative Research>.");
  assert.equal(shown("> [!note]- Folded title\n> body text"), "Folded title\nbody text");
  assert.equal(shown(">> nested quote"), "nested quote");
  assert.equal(shown("## Weights\nThe **score** moved"), "Weights\nThe <b:score> moved");
});

test("markers away from the start of a line stay as written", () => {
  assert.equal(shown("...and a > b, so [!note] stays"), "...and a > b, so [!note] stays");
  assert.equal(shown("see #tag and issue #12"), "see #tag and issue #12");
  assert.equal(shown("#tag at the start"), "#tag at the start");
});
