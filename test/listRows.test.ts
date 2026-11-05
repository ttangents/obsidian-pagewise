import { test } from "vitest";
import assert from "node:assert/strict";
import { isListRow, LIST_ROW_CLASS, markListRows, type RowLike } from "../src/properties/listRows";

/** A property row whose value has the given type and pill count; null type means no value element. */
function row(type: string | null, pills: number): RowLike & { classes: Set<string> } {
  const classes = new Set<string>();
  const value = {
    getAttribute: (name: string) => (name === "data-property-type" ? type : null),
    querySelector: (selector: string) => (selector === ".multi-select-pill" && pills > 0 ? {} : null),
  };
  return {
    classes,
    querySelector: (selector: string) => (selector === ":scope > .metadata-property-value" && type !== null ? value : null),
    classList: {
      toggle: (token: string, force: boolean) => (force ? classes.add(token) : classes.delete(token)),
    },
  };
}

test("a list with pills is a list row; empty lists, other types and bare rows are not", () => {
  assert.equal(isListRow(row("multitext", 2)), true);
  assert.equal(isListRow(row("aliases", 1)), true);
  assert.equal(isListRow(row("tags", 3)), true);
  assert.equal(isListRow(row("multitext", 0)), false);
  assert.equal(isListRow(row("text", 1)), false);
  assert.equal(isListRow(row(null, 0)), false);
});

test("marking adds the class to list rows and takes it off rows that emptied", () => {
  const full = row("tags", 1);
  const emptied = row("tags", 0);
  emptied.classes.add(LIST_ROW_CLASS);
  markListRows({ querySelectorAll: () => [full, emptied] });
  assert.equal(full.classes.has(LIST_ROW_CLASS), true);
  assert.equal(emptied.classes.has(LIST_ROW_CLASS), false);
});
