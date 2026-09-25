import { test } from "node:test";
import assert from "node:assert/strict";
import { pageRule } from "../src/printMargins";

test("writes a uniform @page margin in millimetres", () => {
  assert.equal(pageRule(25.4), "@page { margin: 25.4mm; }");
});
