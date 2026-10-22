import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { BACKGROUNDS } from "../src/appearance/backgrounds";

/** Guards the link between the registry, the tiles, and the stylesheet. */

const source = readFileSync("styles/20-backgrounds.css", "utf8");
const built = readFileSync("styles.css", "utf8");

test("every pattern has both tiles, a veil for each theme, and a selector", () => {
  for (const { id } of BACKGROUNDS.filter((background) => background.id !== "plain")) {
    for (const mode of ["light", "dark"]) {
      assert.ok(existsSync(`assets/tiles/${id}-${mode}.webp`), `${id}-${mode} tile`);
      assert.ok(source.includes(`url("@tile:${id}-${mode}@")`), `${id}-${mode} placeholder`);
    }
    assert.equal(source.split(`--pagewise-veil-${id}:`).length - 1, 2, `${id} veils`);
    assert.ok(source.includes(`.pagewise-active[data-pagewise-pattern="${id}"]`), `${id} selector`);
  }
});

test("the built stylesheet carries every tile inline and no placeholder", () => {
  assert.ok(!built.includes("@tile:"));
  assert.equal(built.split("data:image/webp;base64,").length - 1, (BACKGROUNDS.length - 1) * 2);
});
