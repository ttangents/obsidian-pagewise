import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Guards the rule that Pagewise's stylesheet only styles Pagewise: every selector
 * must name a Pagewise class, so no rule can leak into Obsidian's own UI or its
 * PDF export. That includes the Properties inspector, which applies only where
 * Pagewise has marked a Properties view with .pagewise-inspector.
 */

/** Splits a selector list on its top-level commas, leaving those inside :is() or :has() alone. */
function splitList(prelude: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of prelude) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += char;
  }
  parts.push(current.trim());
  return parts;
}

function selectors(css: string): string[] {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const found: string[] = [];
  for (const match of stripped.matchAll(/([^{}]+)\{/g)) {
    const prelude = match[1].trim();
    if (prelude.startsWith("@")) continue;
    found.push(...splitList(prelude));
  }
  return found;
}

const css = readFileSync("styles.css", "utf8");

test("every selector is scoped to Pagewise", () => {
  const leaks = selectors(css).filter((selector) => !selector.includes("pagewise"));
  assert.deepEqual(leaks, []);
});

test("print rules never touch the exporter's .print container", () => {
  assert.ok(!selectors(css).some((selector) => /(^|\s)\.print\b/.test(selector)));
});
