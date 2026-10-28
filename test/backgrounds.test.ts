import { test } from "vitest";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { BACKGROUNDS } from "../src/appearance/backgrounds";
import { TILES } from "../src/appearance/tiles.generated";

/** Guards the link between the registry, the tiles, and the stylesheet. */

const source = readFileSync("styles/20-backgrounds.css", "utf8");
const built = readFileSync("styles.css", "utf8");

/** The stylesheet budget in STANDARDS.md: Obsidian parses styles.css in every window at startup. */
const STYLESHEET_BUDGET_BYTES = 150 * 1024;

test("every pattern has both tiles, a veil for each theme, and a selector", () => {
  for (const { id } of BACKGROUNDS.filter((background) => background.id !== "plain")) {
    for (const mode of ["light", "dark"] as const) {
      assert.ok(existsSync(`assets/tiles/${id}-${mode}.webp`), `${id}-${mode} tile`);
      assert.ok(TILES[id]?.[mode].startsWith("data:image/webp;base64,"), `${id}-${mode} bundled`);
    }
    assert.equal(source.split(`--pagewise-veil-${id}:`).length - 1, 2, `${id} veils`);
    assert.ok(source.includes(`.pagewise-active[data-pagewise-pattern="${id}"]`), `${id} selector`);
  }
  assert.equal(Object.keys(TILES).length, BACKGROUNDS.length - 1, "no tile without a pattern");
});

test("the stylesheet carries no images and stays within its budget", () => {
  assert.ok(!built.includes("data:image"), "tiles travel in main.js");
  assert.ok(!built.includes("@tile:"));
  const size = statSync("styles.css").size;
  assert.ok(size <= STYLESHEET_BUDGET_BYTES, `styles.css is ${size} bytes; the budget is ${STYLESHEET_BUDGET_BYTES}`);
});
