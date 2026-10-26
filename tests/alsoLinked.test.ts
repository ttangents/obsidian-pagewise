import { test } from "vitest";
import assert from "node:assert/strict";
import { SHOWN_NOTES, shownWhenFolded } from "../src/backlinks/alsoLinked";

test("the line shows every note until folding would hide at least two", () => {
  assert.equal(shownWhenFolded(0), 0);
  assert.equal(shownWhenFolded(SHOWN_NOTES), SHOWN_NOTES);
  assert.equal(shownWhenFolded(SHOWN_NOTES + 1), SHOWN_NOTES + 1);
  assert.equal(shownWhenFolded(SHOWN_NOTES + 2), SHOWN_NOTES);
  assert.equal(shownWhenFolded(16), SHOWN_NOTES);
});
