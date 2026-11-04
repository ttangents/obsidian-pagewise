/**
 * Assembles styles.css from styles/*.css, in file-name order. Ported from Home Cards.
 *
 * The build fails, and writes nothing, when braces do not balance in a partial.
 * Background tiles never enter the stylesheet: Home Cards lends them at run time (D29).
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const partialsDir = join(root, "styles");

function fail(message) {
  console.error(`build-css: ${message}`);
  process.exit(1);
}

function braceBalance(css) {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"[^"]*"/g, '""');
  let depth = 0;
  for (const ch of bare) {
    if (ch === "{") depth++;
    else if (ch === "}" && --depth < 0) return depth;
  }
  return depth;
}

const partials = readdirSync(partialsDir).filter((name) => name.endsWith(".css")).sort();
if (!partials.length) fail("no partials in styles/");

let css = "";
for (const name of partials) {
  const text = readFileSync(join(partialsDir, name), "utf8");
  if (braceBalance(text) !== 0) fail(`${name}: unbalanced braces`);
  css += text;
}

writeFileSync(join(root, "styles.css"), css);
console.log(`build-css: styles.css, ${(css.length / 1024).toFixed(0)} KB`);
