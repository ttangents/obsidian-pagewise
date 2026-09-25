import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/settings";

test("drops keys left by removed features", () => {
  const settings = normalizeSettings({ ...DEFAULT_SETTINGS, bearEnabled: true, collapseProperties: true, enabled: true });
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

test("PDF margins default to a custom one inch and accept only known choices", () => {
  assert.equal(DEFAULT_SETTINGS.pdfMargins, "custom");
  assert.equal(DEFAULT_SETTINGS.pdfMarginMm, 25.4);
  assert.equal(normalizeSettings({ pdfMargins: "page" }).pdfMargins, "page");
  assert.equal(normalizeSettings({ pdfMargins: "huge" }).pdfMargins, "custom");
  assert.equal(normalizeSettings({ pdfMarginMm: 18 }).pdfMarginMm, 18);
});

test("0.22.0's fixed Word margin carries over as a custom margin", () => {
  assert.equal(normalizeSettings({ pdfMargins: "word" }).pdfMargins, "custom");
});
