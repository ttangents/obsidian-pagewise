import assert from "node:assert/strict";
import { test } from "node:test";
import { readingDepthFrom } from "../src/integrations/semanticZoom";

const levels = [
  { level: 5, name: "Topic", hint: "A map" },
  { level: 1, name: "Full", hint: "As written" },
];

function plugin(overrides: Record<string, unknown> = {}) {
  return { api: { version: 1, available: true, levels, open: async () => {}, ...overrides } };
}

test("a ready Semantic Zoom yields its levels", () => {
  assert.deepEqual(readingDepthFrom(plugin())?.levels, levels);
});

test("a missing plugin or API yields nothing", () => {
  assert.equal(readingDepthFrom(undefined), null);
  assert.equal(readingDepthFrom(null), null);
  assert.equal(readingDepthFrom({}), null);
});

test("an unavailable, newer, or incomplete API yields nothing", () => {
  assert.equal(readingDepthFrom(plugin({ available: false })), null);
  assert.equal(readingDepthFrom(plugin({ version: 2 })), null);
  assert.equal(readingDepthFrom(plugin({ open: undefined })), null);
  assert.equal(readingDepthFrom(plugin({ levels: [] })), null);
  assert.equal(readingDepthFrom(plugin({ levels: "x" })), null);
});

test("malformed levels are dropped", () => {
  const depth = readingDepthFrom(plugin({ levels: [...levels, { level: "3" }, null] }));
  assert.deepEqual(depth?.levels, levels);
});

test("open passes the file, level, leaf and line to the API", async () => {
  const calls: unknown[][] = [];
  const p = plugin({ open: async function (this: unknown, ...args: unknown[]) { calls.push([this === p.api, ...args]); } });
  await readingDepthFrom(p)!.open("file", 4, "leaf", 12);
  assert.deepEqual(calls, [[true, "file", { level: 4, leaf: "leaf", line: 12 }]]);
});
