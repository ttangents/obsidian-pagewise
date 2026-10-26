import { test } from "vitest";
import assert from "node:assert/strict";
import { noteAction } from "../src/pagination/noteScope";

test("this note only: a pane resets only when its own note is replaced", () => {
  assert.equal(noteAction("note", false, true, false), "keep", "another tab opened; this pane's note is unchanged");
  assert.equal(noteAction("note", false, true, true), "deactivate");
  assert.equal(noteAction("note", false, false, true), "keep");
  assert.equal(noteAction("note", true, false, false), "keep", "the stored global switch plays no part");
});

test("all notes: every pane follows the global switch", () => {
  assert.equal(noteAction("global", true, false, false), "activate");
  assert.equal(noteAction("global", true, true, true), "relayout");
  assert.equal(noteAction("global", true, true, false), "keep");
  assert.equal(noteAction("global", false, true, false), "deactivate");
  assert.equal(noteAction("global", false, false, true), "keep");
});
