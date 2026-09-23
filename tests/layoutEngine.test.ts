import { test } from "node:test";
import assert from "node:assert/strict";
import { planLayout } from "../src/pagination/layoutEngine";

test("breaks before blocks that overflow the page and pads the last page", () => {
  const plan = planLayout({
    blocks: [
      { top: 0, height: 400 },
      { top: 420, height: 400 },
      { top: 840, height: 300 },
      { top: 1160, height: 200 },
    ],
    contentHeight: 1000,
    breakHeight: 100,
  });
  assert.deepEqual(plan, { breaksBefore: [0, 0, 260, 0], tailPadding: 480 });
});

test("a block taller than a page never breaks before itself at a page start", () => {
  const plan = planLayout({ blocks: [{ top: 0, height: 2500 }], contentHeight: 1000, breakHeight: 100 });
  assert.deepEqual(plan.breaksBefore, [0]);
});

test("an empty note still fills one page", () => {
  assert.deepEqual(planLayout({ blocks: [], contentHeight: 1000, breakHeight: 100 }), {
    breaksBefore: [],
    tailPadding: 1000,
  });
});
