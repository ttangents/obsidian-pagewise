import { test } from "vitest";
import assert from "node:assert/strict";
import { insertCallout, insertSeparator, setHeading } from "../src/toolbar/markdownActions";
import { FakeEditor } from "./fakeEditor";

test("sets, changes, and clears a heading level", () => {
  const editor = new FakeEditor("Title");
  setHeading(editor.asEditor(), 2);
  assert.equal(editor.text, "## Title");
  setHeading(editor.asEditor(), 3);
  assert.equal(editor.text, "### Title");
  setHeading(editor.asEditor(), 3);
  assert.equal(editor.text, "Title");
});

test("wraps selected lines in a block callout", () => {
  const editor = new FakeEditor("one\ntwo", { line: 0, ch: 0 }, { line: 1, ch: 3 });
  insertCallout(editor.asEditor(), "tip", false);
  assert.equal(editor.text, "\n\n> [!tip]\n> one\n> two");
});

test("writes an inline callout on a blank line without a lead-in", () => {
  const editor = new FakeEditor("");
  insertCallout(editor.asEditor(), "warning", true);
  assert.equal(editor.text, "> [!warning] ");
});

test("puts a separator on its own line", () => {
  const blank = new FakeEditor("");
  insertSeparator(blank.asEditor());
  assert.equal(blank.text, "---\n");
  const text = new FakeEditor("para", { line: 0, ch: 4 });
  insertSeparator(text.asEditor());
  assert.equal(text.text, "para\n\n---\n");
});
