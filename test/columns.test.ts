import { test } from "vitest";
import assert from "node:assert/strict";
import { ColumnBalance, cardWeight } from "../src/mentions/columns";

test("equal cards alternate between the columns, left first", () => {
  const balance = new ColumnBalance(2);
  assert.deepEqual([1, 2, 3, 4].map(() => balance.place(100)), [0, 1, 0, 1]);
});

test("a long card lets several short ones fill the other column", () => {
  const balance = new ColumnBalance(2);
  assert.deepEqual([900, 200, 200, 200, 200, 200].map((weight) => balance.place(weight)), [0, 1, 1, 1, 1, 1]);
  assert.equal(balance.place(200), 0);
});

test("a card weighs more with each passage and with longer passages", () => {
  assert.ok(cardWeight(["a"]) < cardWeight(["a", "b"]));
  assert.ok(cardWeight(["short"]) < cardWeight(["a much longer passage of text"]));
});
