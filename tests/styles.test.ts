import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Guards the rule that Pagewise's stylesheet only styles Pagewise: every selector
 * must name a Pagewise class, so no rule can leak into Obsidian's own UI or its
 * PDF export. The Properties sidebar compaction is the one deliberate exception.
 */

const ALLOWED_UNSCOPED = [/^\.workspace-leaf-content\[data-type="file-properties"\] /];

function selectors(css: string): string[] {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const found: string[] = [];
  for (const match of stripped.matchAll(/([^{}]+)\{/g)) {
    const prelude = match[1].trim();
    if (prelude.startsWith("@")) continue;
    prelude.split(",").forEach((part) => found.push(part.trim()));
  }
  return found;
}

const css = readFileSync("styles.css", "utf8");

test("every selector is scoped to Pagewise", () => {
  const leaks = selectors(css).filter(
    (selector) => !selector.includes("pagewise") && !ALLOWED_UNSCOPED.some((pattern) => pattern.test(selector))
  );
  assert.deepEqual(leaks, []);
});

test("print rules never touch the exporter's .print container", () => {
  assert.ok(!selectors(css).some((selector) => /(^|\s)\.print\b/.test(selector)));
});
