// Bundles each tests/*.test.ts with esbuild and runs them with Node's built-in test
// runner. Tests may import only modules free of runtime Obsidian dependencies.
import esbuild from "esbuild";
import { readdirSync, rmSync } from "fs";
import { spawnSync } from "child_process";

const outdir = ".test-build";
rmSync(outdir, { recursive: true, force: true });
const entryPoints = readdirSync("tests")
  .filter((name) => name.endsWith(".test.ts"))
  .map((name) => `tests/${name}`);
await esbuild.build({
  entryPoints,
  outdir,
  bundle: true,
  platform: "node",
  format: "cjs",
  outExtension: { ".js": ".cjs" },
  external: ["obsidian"],
  logLevel: "warning",
});
const files = entryPoints.map((entry) => `${outdir}/${entry.slice("tests/".length).replace(/\.ts$/, ".cjs")}`);
const result = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(result.status ?? 1);
