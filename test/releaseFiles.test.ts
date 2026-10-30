import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("versions.json maps manifest version to minAppVersion", () => {
  const manifest = JSON.parse(readFileSync("manifest.json", "utf8")) as { version: string; minAppVersion: string; };
  const versions = JSON.parse(readFileSync("versions.json", "utf8")) as Record<string, string>;
  assert.equal(versions[manifest.version], manifest.minAppVersion);
});

test("LICENSE starts with MIT License and contains the copyright line", () => {
  const license = readFileSync("LICENSE", "utf8");
  assert.ok(license.startsWith("MIT License"), "LICENSE must start with MIT License");
  assert.ok(license.includes("Copyright (c) 2026 ttangents"), "LICENSE must contain the copyright line");
});
