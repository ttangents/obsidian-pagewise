import { test } from "vitest";
import assert from "node:assert/strict";
import type { MarkdownView } from "obsidian";
import { setReadingBottomPadding, setReadingRendersWholeNote } from "../src/obsidianInternals";

const viewWith = (renderer: unknown) => ({ previewMode: { renderer } }) as unknown as MarkdownView;

test("switching Reading view's bottom space sets the flag and applies it at once", () => {
  let resized = 0;
  const renderer = { addBottomPadding: true, onResize: () => (resized += 1) };
  assert.equal(setReadingBottomPadding(viewWith(renderer), false), true);
  assert.equal(renderer.addBottomPadding, false);
  assert.equal(resized, 1);
  assert.equal(setReadingBottomPadding(viewWith(renderer), true), true);
  assert.equal(renderer.addBottomPadding, true);
});

test("an Obsidian without the switch is left alone", () => {
  assert.equal(setReadingBottomPadding(viewWith(undefined), false), false);
  assert.equal(setReadingBottomPadding(viewWith({ onResize() {} }), false), false);
});

test("a paginated note keeps every section attached, and turning off restores Obsidian's own distance", () => {
  let updates = 0;
  const renderer = { renderExtraMinPx: 500, updateVirtualDisplay: () => (updates += 1) };
  const view = viewWith(renderer);
  assert.equal(setReadingRendersWholeNote(view, true), true);
  assert.ok(renderer.renderExtraMinPx > 1e6);
  assert.equal(setReadingRendersWholeNote(view, true), true);
  assert.equal(setReadingRendersWholeNote(view, false), true);
  assert.equal(renderer.renderExtraMinPx, 500);
  assert.equal(updates, 3);
  assert.equal(setReadingRendersWholeNote(viewWith({}), true), false);
});
