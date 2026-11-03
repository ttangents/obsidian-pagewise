import { test } from "vitest";
import assert from "node:assert/strict";
import { BUILT_IN_CONTROLS, EDITING_CONTROLS, NAVIGATION_CONTROLS, availableHighlights, editingGroups, resolveControl } from "../src/toolbar/controls";

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
