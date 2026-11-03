import { test } from "vitest";
import assert from "node:assert/strict";
import { badgeKey, badgeLabel } from "../src/toolbar/badge";
import { normalizeBadge, validateToolbarItem } from "../src/toolbar/extensionApi";

const item = { id: "demo:badge", label: "Demo", icon: "sparkles", onClick: () => undefined };

test("an item may carry a badge function, and anything else under that name is refused", () => {
  const ok = validateToolbarItem({ ...item, badge: () => ({ kind: "dot" }) });
  assert.ok("item" in ok && typeof ok.item.badge === "function");
  assert.ok("error" in validateToolbarItem({ ...item, badge: { kind: "dot" } }));
  const none = validateToolbarItem(item);
  assert.ok("item" in none && none.item.badge === undefined);
});

test("a badge is checked and copied: known kinds only, progress clamped, label trimmed", () => {
  assert.deepEqual(normalizeBadge({ kind: "dot", label: "  Out of date  " }), { kind: "dot", label: "Out of date" });
  assert.deepEqual(normalizeBadge({ kind: "progress", value: 1.7 }), { kind: "progress", value: 1 });
  assert.deepEqual(normalizeBadge({ kind: "progress", value: Number.NaN }), { kind: "progress" });
  assert.equal(normalizeBadge({ kind: "star" }), null);
  assert.equal(normalizeBadge(null), null);
  assert.equal(normalizeBadge("dot"), null);
});

test("the badge's label joins the button's accessible name", () => {
  assert.equal(badgeLabel("Reading depth", { kind: "progress", value: 0.4, label: "4 of 11 sections done" }), "Reading depth: 4 of 11 sections done");
  assert.equal(badgeLabel("Reading depth", { kind: "dot" }), "Reading depth");
  assert.equal(badgeLabel("Reading depth", null), "Reading depth");
});

test("an unchanged badge keeps its key, so it is not redrawn", () => {
  assert.equal(badgeKey(null), "");
  assert.equal(badgeKey({ kind: "dot" }), "dot");
  assert.equal(badgeKey({ kind: "progress" }), "progress:spin");
  assert.equal(badgeKey({ kind: "progress", value: 0.364 }), badgeKey({ kind: "progress", value: 0.36 }));
  assert.notEqual(badgeKey({ kind: "progress", value: 0.36 }), badgeKey({ kind: "progress", value: 0.45 }));
});
