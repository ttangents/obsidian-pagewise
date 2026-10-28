import { test } from "vitest";
import assert from "node:assert/strict";
import { shownWhenFolded } from "../src/mentions/fold";

test("a list shows every item until folding would hide at least two", () => {
  assert.equal(shownWhenFolded(0, 5), 0);
  assert.equal(shownWhenFolded(5, 5), 5);
  assert.equal(shownWhenFolded(6, 5), 6);
  assert.equal(shownWhenFolded(7, 5), 5);
  assert.equal(shownWhenFolded(16, 5), 5);
});
