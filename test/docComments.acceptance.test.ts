import { test } from "vitest";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The acceptance test for PW-1: every top-level export in these folders has a TSDoc comment right above it. */
const folders = ["src/tables", "src/pagination"];

/** Each `export` line whose nearest non-blank line above does not end a TSDoc comment. */
function undocumented(file: string): string[] {
  const lines = readFileSync(file, "utf8").split("\n");
  const missing: string[] = [];
  lines.forEach((line, index) => {
    if (!line.startsWith("export ")) return;
    let above = index - 1;
    while (above >= 0 && lines[above].trim() === "") above -= 1;
    const previous = above >= 0 ? lines[above].trim() : "";
    if (!previous.endsWith("*/")) missing.push(`${file}:${index + 1}: ${line.trim()}`);
  });
  return missing;
}

test("every export in src/tables and src/pagination has a TSDoc comment", () => {
  const missing = folders.flatMap((folder) =>
    readdirSync(folder)
      .filter((name) => name.endsWith(".ts"))
      .flatMap((name) => undocumented(join(folder, name))),
  );
  assert.deepEqual(missing, []);
});
