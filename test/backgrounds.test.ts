import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { PLAIN, pagewiseVeil, readBackgrounds } from "../src/appearance/backgrounds";

const built = readFileSync("styles.css", "utf8");

/** The stylesheet budget in STANDARDS.md: Obsidian parses styles.css in every window at startup. */
const STYLESHEET_BUDGET_BYTES = 150 * 1024;

const tile = "data:image/webp;base64,UklGRg==";
const entry = (overrides: Record<string, unknown> = {}) => ({
  id: "leaves",
  label: "Leaves",
  light: tile,
  dark: "app://local/plugins/home-cards/backgrounds/leaves-dark.webp",
  veil: { light: 0.9, dark: 0.85 },
  ...overrides,
});

test("Pagewise keeps 60% of the ink Home Cards keeps", () => {
  assert.equal(pagewiseVeil(1), 1);
  assert.equal(pagewiseVeil(0), 0.4);
  assert.equal(pagewiseVeil(0.8), 0.88);
  const [leaves] = readBackgrounds([entry()]);
  assert.deepEqual(leaves.veil, { light: 0.94, dark: 0.91 });
  assert.deepEqual(leaves.tiles, { light: tile, dark: "app://local/plugins/home-cards/backgrounds/leaves-dark.webp" });
});

test("a malformed entry costs only itself", () => {
  const list = readBackgrounds([
    entry(),
    entry({ id: "quote", light: 'data:image/png;base64,AA");background:red' }),
    entry({ id: "remote", dark: "https://example.com/tile.png" }),
    entry({ id: "spaces", light: "app://local/a b.png" }),
    entry({ id: "veil", veil: { light: 2, dark: 0.5 } }),
    entry({ id: "", label: "No id" }),
    entry({ id: PLAIN, label: "Plain" }),
    entry({ label: "Leaves again" }),
    null,
    "leaves",
    entry({ id: "rain", label: "Rain" }),
  ]);
  assert.deepEqual(
    list.map((background) => `${background.id}:${background.label}`),
    ["leaves:Leaves", "rain:Rain"]
  );
  assert.deepEqual(readBackgrounds({ length: 1 }), []);
});

test("the stylesheet carries no images, names no pattern, and stays within its budget", () => {
  assert.ok(!built.includes("data:image"), "Home Cards lends the tiles at run time");
  assert.ok(!/data-pagewise-pattern="/.test(built), "no rule is written for one pattern");
  const size = statSync("styles.css").size;
  assert.ok(size <= STYLESHEET_BUDGET_BYTES, `styles.css is ${size} bytes; the budget is ${STYLESHEET_BUDGET_BYTES}`);
});
