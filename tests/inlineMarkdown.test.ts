import { test } from "node:test";
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
  assert.equal(shown("as [[Can..."), "as [[Can...");
  assert.equal(shown("a == b and c == d"), "a == b and c == d");
  assert.equal(shown("snake_case_name and 2 * 3 * 4"), "snake_case_name and 2 * 3 * 4");
  assert.equal(shown("- list item"), "- list item");
  assert.equal(shown("half ==open"), "half ==open");
});

test("backslash escapes show the character, not the backslash", () => {
  assert.equal(shown("\\*not italic\\*"), "*not italic*");
});
