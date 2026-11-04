import { test } from "vitest";
import assert from "node:assert/strict";
import { BlockWatcher, type SizeEntry, type SizeObserver } from "../src/pagination/blockWatcher";

/** A fake ResizeObserver: records what is observed and lets the test deliver notifications. */
function fakeObserver() {
  const observed = new Set<object>();
  let deliver: (entries: readonly SizeEntry[]) => void = () => undefined;
  const observer: SizeObserver = {
    observe: (target) => void observed.add(target),
    unobserve: (target) => void observed.delete(target),
    disconnect: () => observed.clear(),
  };
  return {
    observed,
    notify: (entries: readonly SizeEntry[]) => deliver(entries),
    factory: (callback: (entries: readonly SizeEntry[]) => void) => {
      deliver = callback;
      return observer;
    },
  };
}

const el = () => ({}) as Element;

test("a block that grows after it was measured asks for a layout", () => {
  const fake = fakeObserver();
  const sheet = el();
  const dataview = el();
  let changes = 0;
  const watcher = new BlockWatcher(sheet, fake.factory, () => changes++);
  watcher.track([dataview]);
  fake.notify([{ target: dataview, width: 600, height: 20 }]);
  assert.equal(changes, 0, "the first report is the measured size");
  fake.notify([{ target: dataview, width: 600, height: 480 }]);
  assert.equal(changes, 1);
});

test("the sheet's width counts, its height does not", () => {
  const fake = fakeObserver();
  const sheet = el();
  let changes = 0;
  new BlockWatcher(sheet, fake.factory, () => changes++);
  fake.notify([{ target: sheet, width: 700, height: 1000 }]);
  fake.notify([{ target: sheet, width: 700, height: 3000 }]);
  assert.equal(changes, 0, "spacers change the sheet's height");
  fake.notify([{ target: sheet, width: 500, height: 3000 }]);
  assert.equal(changes, 1);
});

test("sub-pixel changes and unchanged sizes are ignored, and one batch asks once", () => {
  const fake = fakeObserver();
  const a = el();
  const b = el();
  let changes = 0;
  const watcher = new BlockWatcher(el(), fake.factory, () => changes++);
  watcher.track([a, b]);
  fake.notify([{ target: a, width: 1, height: 100 }, { target: b, width: 1, height: 100 }]);
  fake.notify([{ target: a, width: 1, height: 100.3 }]);
  assert.equal(changes, 0);
  fake.notify([{ target: a, width: 1, height: 150 }, { target: b, width: 1, height: 150 }]);
  assert.equal(changes, 1);
});

test("blocks that leave the sheet are let go, and dispose stops everything", () => {
  const fake = fakeObserver();
  const sheet = el();
  const a = el();
  const b = el();
  const watcher = new BlockWatcher(sheet, fake.factory, () => undefined);
  watcher.track([a, b]);
  assert.deepEqual([...fake.observed], [sheet, a, b]);
  watcher.track([b]);
  assert.deepEqual([...fake.observed], [sheet, b]);
  watcher.dispose();
  assert.equal(fake.observed.size, 0);
});
