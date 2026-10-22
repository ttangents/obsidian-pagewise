import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/settings";

test("drops keys left by removed features", () => {
  const settings = normalizeSettings({ ...DEFAULT_SETTINGS, bearEnabled: true, collapseProperties: true, enabled: true, pdfMargins: "custom", pdfMarginMm: 18 });
  assert.deepEqual(Object.keys(settings).sort(), Object.keys(DEFAULT_SETTINGS).sort());
});

test("keeps valid stored values", () => {
  const stored = { ...DEFAULT_SETTINGS, scope: "global", marginMm: 15, toolbarDirection: "vertical", pageSize: "legal" };
  assert.deepEqual(normalizeSettings(stored), stored);
});

test("falls back to defaults for invalid or missing values", () => {
  const settings = normalizeSettings({ scope: "everywhere", marginMm: "wide", gapPx: -5, pageSize: "b5" });
  assert.deepEqual(settings, DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
});

test("keeps the legacy toolbarDirection value so a rollback to 0.24 finds it", () => {
  const stored = { ...DEFAULT_SETTINGS, toolbarDirection: "vertical" };
  assert.equal(normalizeSettings(stored).toolbarDirection, "vertical");
});
