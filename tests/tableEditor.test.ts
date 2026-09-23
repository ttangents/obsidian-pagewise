import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTableEdit, deleteTable, locateTable } from "../src/tables/tableEditor";
import { setAlignment } from "../src/tables/tableModel";
import { FakeEditor } from "./fakeEditor";

const DOC = ["Intro", "", "| a | b | c |", "| - | - | - |", "| 1 | 2 | 3 |", "| 4 | 5 | 6 |", "", "Outro"].join("\n");

test("finds the table, cell column, and body row under the cursor", () => {
  const found = locateTable(new FakeEditor(DOC, { line: 5, ch: 5 }).asEditor())!;
  assert.equal(found.startLine, 2);
  assert.equal(found.endLine, 5);
  assert.deepEqual(found.context, { column: 1, columnEnd: 1, bodyRow: 1 });
});

test("reports no body row on the header line and no table outside one", () => {
  assert.equal(locateTable(new FakeEditor(DOC, { line: 2, ch: 2 }).asEditor())!.context.bodyRow, null);
  assert.equal(locateTable(new FakeEditor(DOC, { line: 0, ch: 0 }).asEditor()), null);
});

test("a selection spans every column it touches", () => {
  const editor = new FakeEditor(DOC, { line: 4, ch: 2 }, { line: 5, ch: 10 });
  assert.deepEqual(locateTable(editor.asEditor())!.context, { column: 0, columnEnd: 2, bodyRow: 1 });
});

test("rewrites only the table and leaves surrounding text alone", () => {
  const editor = new FakeEditor(DOC, { line: 4, ch: 2 });
  applyTableEdit(editor.asEditor(), (model, ctx) => setAlignment(model, ctx.column, ctx.columnEnd, "center"));
  assert.deepEqual(editor.lines, ["Intro", "", "| a   | b   | c   |", "| :-: | --- | --- |", "| 1   | 2   | 3   |", "| 4   | 5   | 6   |", "", "Outro"]);
});

test("a refused edit leaves the document untouched", () => {
  const editor = new FakeEditor(DOC, { line: 4, ch: 2 });
  applyTableEdit(editor.asEditor(), () => null);
  assert.equal(editor.text, DOC);
});

test("deletes the whole table", () => {
  const editor = new FakeEditor(DOC, { line: 3, ch: 0 });
  deleteTable(editor.asEditor());
  assert.deepEqual(editor.lines, ["Intro", "", "", "Outro"]);
});
