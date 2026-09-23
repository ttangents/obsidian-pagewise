import { test } from "node:test";
import assert from "node:assert/strict";
import * as m from "../src/tables/tableModel";

const SOURCE = [
  "| Name | Score | Notes |",
  "| --- | ---: | --- |",
  "| beta | 10 | has \\| pipe |",
  "| alpha | 2 | plain |",
  "| gamma | 33 |",
];
const table = () => m.parseTable(SOURCE)!;

test("parses header, alignments, escaped pipes, and pads short rows", () => {
  const t = table();
  assert.deepEqual(t.header, ["Name", "Score", "Notes"]);
  assert.deepEqual(t.alignments, ["none", "right", "none"]);
  assert.equal(t.rows[0][2], "has \\| pipe");
  assert.deepEqual(t.rows[2], ["gamma", "33", ""]);
});

test("rejects text that is not a table", () => {
  assert.equal(m.parseTable(["just | a sentence", "with | pipes"]), null);
});

test("serializes tidily and round-trips", () => {
  const out = m.serializeTable(table());
  assert.equal(out[0], "| Name  | Score | Notes       |");
  assert.equal(out[1], "| ----- | ----: | ----------- |");
  assert.deepEqual(m.parseTable(out), table());
});

test("keeps indentation", () => {
  const t = m.parseTable(["  | a | b |", "  | - | - |", "  | 1 | 2 |"])!;
  assert.ok(m.serializeTable(t).every((line) => line.startsWith("  | ")));
});

test("aligns a column range in either direction", () => {
  const t = m.parseTable(["| a | b | c | d |", "| - | - | - | - |", "| 1 | 2 | 3 | 4 |"])!;
  assert.deepEqual(m.setAlignment(t, 1, 2, "center")!.alignments, ["none", "center", "center", "none"]);
  assert.deepEqual(m.setAlignment(t, 2, 1, "right")!.alignments, ["none", "right", "right", "none"]);
  assert.equal(m.setAlignment(t, 3, 4, "left"), null);
  assert.match(m.serializeTable(m.setAlignment(t, 0, 0, "left")!)[1], /^\| :-- \|/);
});

test("inserts, deletes, moves, and duplicates", () => {
  let t = m.insertRow(table(), 0);
  assert.deepEqual(t.rows[0], ["", "", ""]);
  t = m.deleteRow(t, 0)!;
  t = m.insertColumn(t, 1);
  assert.deepEqual(t.header, ["Name", "", "Score", "Notes"]);
  t = m.deleteColumn(t, 1)!;
  t = m.moveRow(t, 0, 1)!;
  assert.equal(t.rows[0][0], "alpha");
  t = m.moveColumn(t, 0, 1)!;
  assert.deepEqual(t.header, ["Score", "Name", "Notes"]);
  assert.deepEqual(t.alignments, ["right", "none", "none"], "alignment travels with its column");
  t = m.duplicateRow(t, 0)!;
  assert.deepEqual(t.rows[0], t.rows[1]);
});

test("refuses invalid operations", () => {
  assert.equal(m.moveRow(table(), 0, -1), null);
  assert.equal(m.deleteRow(table(), 99), null);
  assert.equal(m.deleteColumn(m.parseTable(["| a |", "| - |", "| 1 |"])!, 0), null);
});

test("sorts numerically when both cells are numbers, textually otherwise", () => {
  assert.deepEqual(m.sortRows(table(), 1, true)!.rows.map((r) => r[1]), ["2", "10", "33"]);
  assert.deepEqual(m.sortRows(table(), 0, false)!.rows.map((r) => r[0]), ["gamma", "beta", "alpha"]);
});

test("transposes and transposes back", () => {
  const t = m.parseTable(["| Metric | Q1 | Q2 |", "| --- | --- | --- |", "| Revenue | 5 | 7 |", "| Cost | 3 | 4 |"])!;
  const x = m.transpose(t);
  assert.deepEqual(x.header, ["Metric", "Revenue", "Cost"]);
  assert.deepEqual(x.rows, [["Q1", "5", "3"], ["Q2", "7", "4"]]);
  const back = m.transpose(x);
  assert.deepEqual([back.header, back.rows], [t.header, t.rows]);
});
