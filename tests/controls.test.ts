import { test } from "vitest";
import assert from "node:assert/strict";
import { BUILT_IN_CONTROLS, EDITING_CONTROLS, editingGroups } from "../src/toolbar/controls";

test("the settings list and the bar share one catalogue of built-in controls", () => {
  assert.deepEqual(
    BUILT_IN_CONTROLS.map(({ id }) => id),
    ["headings", "lists", "bold", "italic", "highlight", "link", "table", "image", "background", "properties"]
  );
  assert.equal(new Set(BUILT_IN_CONTROLS.map(({ id }) => id)).size, BUILT_IN_CONTROLS.length, "ids are unique");
});

test("each editing control runs a command or opens a menu, never both", () => {
  EDITING_CONTROLS.forEach((control) => assert.ok(!control.command !== !control.menu, control.id));
  assert.equal(new Set(EDITING_CONTROLS.map((control) => control.overflowRank)).size, EDITING_CONTROLS.length, "ranks are distinct");
  assert.deepEqual(editingGroups().map((group) => group.length), [2, 3, 3]);
});
