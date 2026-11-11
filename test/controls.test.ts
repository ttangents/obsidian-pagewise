import { test } from "vitest";
import assert from "node:assert/strict";
import { BUILT_IN_CONTROLS, EDITING_CONTROLS, NAVIGATION_CONTROLS, OVERFLOW_RANK, TRAILING_CONTROLS, addedRank, availableHighlights, editingGroups, resolveControl } from "../src/toolbar/controls";

test("the settings list and the bar share one catalogue of built-in controls", () => {
  assert.deepEqual(
    BUILT_IN_CONTROLS.map(({ id }) => id),
    ["back", "forward", "headings", "lists", "bold", "italic", "highlight", "link", "table", "image", "background", "properties"]
  );
  assert.equal(new Set(BUILT_IN_CONTROLS.map(({ id }) => id)).size, BUILT_IN_CONTROLS.length, "ids are unique");
});

test("each editing control runs a command or opens a menu, never both", () => {
  EDITING_CONTROLS.forEach((control) => assert.ok(!control.command !== !control.menu, control.id));
  assert.equal(new Set(EDITING_CONTROLS.map((control) => control.overflowRank)).size, EDITING_CONTROLS.length, "ranks are distinct");
  assert.deepEqual(editingGroups().map((group) => group.length), [2, 3, 3]);
});

test("back and forward leave for More after every editing control", () => {
  const editingMax = Math.max(...EDITING_CONTROLS.map((control) => control.overflowRank));
  NAVIGATION_CONTROLS.forEach((control) => assert.ok(control.overflowRank > editingMax, control.id));
});

test("Highlight lists plain highlight, then Obsidian's six colours by their own commands", () => {
  const all = availableHighlights(() => true);
  assert.deepEqual(
    all.map(({ title }) => title),
    ["Highlight", "Red highlight", "Orange highlight", "Yellow highlight", "Green highlight", "Blue highlight", "Purple highlight"]
  );
  assert.deepEqual(
    all.map(({ commandId }) => commandId),
    [
      "editor:toggle-highlight",
      "editor:toggle-highlight-red",
      "editor:toggle-highlight-orange",
      "editor:toggle-highlight-yellow",
      "editor:toggle-highlight-green",
      "editor:toggle-highlight-blue",
      "editor:toggle-highlight-purple",
    ]
  );
  assert.deepEqual(availableHighlights((id) => id.endsWith("-red")).map(({ id }) => id), ["plain", "red"]);
});

test("Highlight opens its menu where Obsidian has colours, and highlights in one click where it has none", () => {
  const highlight = EDITING_CONTROLS.find((control) => control.id === "highlight");
  assert.ok(highlight);
  assert.deepEqual(resolveControl(highlight, () => true), { command: undefined, menu: "highlight" });
  assert.deepEqual(resolveControl(highlight, () => false), { command: "editor:toggle-highlight" });
  const bold = EDITING_CONTROLS.find((control) => control.id === "bold");
  assert.ok(bold);
  assert.deepEqual(resolveControl(bold, () => false), { command: "editor:toggle-bold", menu: undefined });
});

test("controls leave for More in the proposed order: Background, rare inserts, added controls, writing tools, navigation, Properties", () => {
  const ranks = new Map<string, number>([
    ...EDITING_CONTROLS.map((control) => [control.id, control.overflowRank] as const),
    ...NAVIGATION_CONTROLS.map((control) => [control.id, control.overflowRank] as const),
    ...TRAILING_CONTROLS.map((control) => [control.id, control.overflowRank] as const),
    ["added (leftmost of 3)", addedRank(0, 3)],
    ["added (rightmost of 3)", addedRank(2, 3)],
  ]);
  const order = [...ranks.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
  assert.deepEqual(order, [
    "background",
    "image",
    "table",
    "highlight",
    "added (rightmost of 3)",
    "added (leftmost of 3)",
    "link",
    "lists",
    "headings",
    "italic",
    "bold",
    "forward",
    "back",
    "properties",
  ]);
});

test("added controls leave right to left and stay between the rare inserts and the writing tools, however many there are", () => {
  for (const count of [1, 2, 20, 500]) {
    const ranks = Array.from({ length: count }, (_, index) => addedRank(index, count));
    ranks.slice(1).forEach((rank, i) => assert.ok(rank < ranks[i], `${count}: control ${i + 1} leaves before control ${i}`));
    ranks.forEach((rank) => assert.ok(rank >= OVERFLOW_RANK.added && rank < OVERFLOW_RANK.addedEnd, `${count}: ${rank}`));
  }
  assert.ok(OVERFLOW_RANK.highlight < OVERFLOW_RANK.added && OVERFLOW_RANK.addedEnd <= OVERFLOW_RANK.link);
});
