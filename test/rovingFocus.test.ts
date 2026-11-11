import { test } from "vitest";
import assert from "node:assert/strict";
import { focusDestination } from "../src/toolbar/rovingFocus";

/**
 * Where focus goes when the focused toolbar control stops showing (REVIEW-2026-11-12 R2).
 * The toolbar wires this to the DOM; here buttons are plain names.
 */
const bar = ["back", "forward", "bold", "italic", "image", "more", "properties"];
const where = (from: string, shown: string[], overflowed: string[] = []) =>
  focusDestination(bar, from, { isShown: (b) => shown.includes(b), movedToMore: (b) => overflowed.includes(b), more: "more" });

test("a control that moved into More hands focus to More", () => {
  assert.equal(where("image", ["back", "forward", "bold", "italic", "more", "properties"], ["image"]), "more");
});

test("a control hidden for another reason hands focus to the nearest showing control before it", () => {
  // Reading view hides the formatting group: Bold goes to Forward, not to More.
  assert.equal(where("bold", ["back", "forward", "more", "properties"]), "forward");
});

test("More leaving as the pane widens hands focus to the last control before it", () => {
  assert.equal(where("more", ["back", "forward", "bold", "italic", "image", "properties"], ["more"]), "image");
});

test("with nothing showing before it, focus goes to the next showing control", () => {
  assert.equal(where("back", ["more", "properties"], ["back"]), "more");
  assert.equal(where("back", ["properties"]), "properties");
});

test("a control in More while More itself is hidden falls back to the nearest showing control", () => {
  assert.equal(where("image", ["back", "bold"], ["image"]), "bold");
});

test("nothing showing gives no destination, so the toolbar returns focus to the note", () => {
  assert.equal(where("bold", []), null);
});

test("a control no longer on the bar (removed by a rebuild) goes to the first showing control", () => {
  assert.equal(focusDestination(bar, "gone", { isShown: (b) => b !== "back", movedToMore: () => false, more: "more" }), "forward");
});
