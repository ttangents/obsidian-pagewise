import { test } from "vitest";
import assert from "node:assert/strict";
import { GALLERY, availableSuggestions } from "../src/toolbar/gallery";

test("offers only entries whose command exists and is not on the toolbar yet", () => {
  const present = new Set(["dataview:dataview-force-refresh-views", "templater-obsidian:insert-templater", "longform:longform-compile-current"]);
  const offered = availableSuggestions(GALLERY, (id) => present.has(id), ["templater-obsidian:insert-templater"]);
  assert.deepEqual(
    offered.map((entry) => entry.commandId),
    ["dataview:dataview-force-refresh-views", "longform:longform-compile-current"]
  );
});

test("every entry is well formed and unique", () => {
  const ids = GALLERY.map((entry) => entry.commandId);
  assert.equal(new Set(ids).size, ids.length);
  for (const entry of GALLERY) {
    assert.match(entry.commandId, /^[a-z0-9-]+:[a-z0-9-]+$/, entry.commandId);
    assert.ok(entry.plugin && entry.icon, entry.commandId);
    assert.match(entry.label, /^[A-Z].*[^.]$/, `${entry.label} starts with a capital and has no full stop`);
  }
});
