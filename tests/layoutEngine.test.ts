import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutBlocks, planLayout } from "../src/pagination/layoutEngine";

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

test("blocks after an oversized block break on the page it ends on, never with a negative spacer", () => {
  const plan = planLayout({
    blocks: [
      { top: 0, height: 2500 },
      { top: 2520, height: 300 },
      { top: 2840, height: 300 },
    ],
    contentHeight: 1000,
    breakHeight: 100,
  });
  assert.deepEqual(plan.breaksBefore, [0, 0, 260]);
  assert.ok(plan.breaksBefore.every((height) => height >= 0));
});

test("layout skips the lazy-render placeholder and children with no height", () => {
  const { indexes, blocks } = layoutBlocks(
    [
      { top: 10, height: 5000, placeholder: true },
      { top: 5010, height: 0, placeholder: false },
      { top: 5010, height: 200, placeholder: false },
      { top: 5230, height: 100, placeholder: false },
      { top: 5330, height: 900, placeholder: true },
    ],
    10
  );
  assert.deepEqual(indexes, [2, 3]);
  assert.deepEqual(blocks, [
    { top: 0, height: 200 },
    { top: 220, height: 100 },
  ]);
});

test("without a placeholder, positions are measured from the content top", () => {
  const { blocks } = layoutBlocks([{ top: 40, height: 10, placeholder: false }], 30);
  assert.deepEqual(blocks, [{ top: 10, height: 10 }]);
});
