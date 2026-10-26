import { test } from "vitest";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/settings";

test("drops keys left by removed features", () => {
  const settings = normalizeSettings({ ...DEFAULT_SETTINGS, bearEnabled: true, collapseProperties: true, enabled: true, pdfMargins: "custom", pdfMarginMm: 18 });
  assert.deepEqual(Object.keys(settings).sort(), Object.keys(DEFAULT_SETTINGS).sort());
});

test("keeps valid stored values", () => {
  const stored = { ...DEFAULT_SETTINGS, scope: "global", marginMm: 15, pageSize: "legal" };
  assert.deepEqual(normalizeSettings(stored), stored);
});

test("falls back to defaults for invalid or missing values", () => {
  const settings = normalizeSettings({ scope: "everywhere", marginMm: "wide", gapPx: -5, pageSize: "b5" });
  assert.deepEqual(settings, DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
});

test("a 0.32 data.json loses only the legacy toolbarDirection key", () => {
  const stored = {
    scope: "global",
    globalEnabled: true,
    pageSize: "letter",
    marginMm: 20,
    gapPx: 32,
    propertiesMode: "collapse",
    calloutStyle: "theme",
    toolbarDirection: "vertical",
    background: "leaves",
    toolbarScope: "all",
    hiddenControls: ["bold"],
    commandButtons: [{ commandId: "daily-notes", icon: "calendar" }],
  };
  const { toolbarDirection, ...kept } = stored;
  assert.equal(toolbarDirection, "vertical");
  assert.deepEqual(normalizeSettings(stored), kept);
});

test("keeps a known background and falls back to plain for anything else", () => {
  assert.equal(normalizeSettings({ background: "leaves" }).background, "leaves");
  assert.equal(normalizeSettings({ background: "velvet" }).background, "plain");
  assert.equal(normalizeSettings({}).background, "plain");
});

test("toolbar settings keep valid values and drop malformed ones", () => {
  const settings = normalizeSettings({
    toolbarScope: "all",
    hiddenControls: ["bold", "bold", 7, "", "demo:hello"],
    commandButtons: [
      { commandId: "daily-notes", icon: "calendar" },
      { commandId: "daily-notes", icon: "sun" },
      { commandId: "", icon: "x" },
      { commandId: "graph:open" },
      "junk",
    ],
  });
  assert.equal(settings.toolbarScope, "all");
  assert.deepEqual(settings.hiddenControls, ["bold", "demo:hello"]);
  assert.deepEqual(settings.commandButtons, [{ commandId: "daily-notes", icon: "calendar" }]);
  assert.equal(normalizeSettings({ toolbarScope: "everywhere" }).toolbarScope, "paginated");
});

test("callouts default to Pagewise cards, and only cards or theme are kept", () => {
  assert.equal(normalizeSettings({}).calloutStyle, "cards");
  assert.equal(normalizeSettings({ calloutStyle: "theme" }).calloutStyle, "theme");
  assert.equal(normalizeSettings({ calloutStyle: "boxes" }).calloutStyle, "cards");
});
