#!/bin/bash
#
# Pagewise's build recipe, per the Vibes vault's Template code folder
# (Shared decisions SD8). Runner calls the three in order from the
# repository root; a session can run them the same way.
#
#     scripts/build.sh build   generated files, type check and main.js
#     scripts/build.sh test    the Vitest suites
#     scripts/build.sh check   the project checks in Pagewise's STANDARDS
#
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

failed=0
run() {
  local name="$1"; shift
  local output
  if output="$("$@" 2>&1)"; then
    echo "PASS $name"
  else
    echo "FAIL $name: ${output:-exit $?}" | head -20
    failed=1
  fi
}

# Budgets from STANDARDS, in bytes.
check_size() { # file limit
  local size
  size=$(stat -f %z "$1") || { echo "$1 is missing; run build first"; return 1; }
  [ "$size" -le "$2" ] || { echo "$1 is $size bytes, over $2"; return 1; }
}

# manifest.json and package.json agree on the version, and versions.json,
# once it exists, maps it to the manifest's minAppVersion.
check_versions() {
  node -e '
    const fs = require("fs");
    const m = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
    const p = JSON.parse(fs.readFileSync("package.json", "utf8"));
    const problems = [];
    if (m.version !== p.version) problems.push(`manifest ${m.version} but package ${p.version}`);
    if (fs.existsSync("versions.json")) {
      const v = JSON.parse(fs.readFileSync("versions.json", "utf8"));
      if (v[m.version] !== m.minAppVersion) problems.push(`versions.json lacks ${m.version} -> ${m.minAppVersion}`);
    }
    if (problems.length) { console.log(problems.join("; ")); process.exit(1); }'
}

case "${1:-}" in
  build) npm run css && npx tsc -noEmit -skipLibCheck && node esbuild.config.mjs production ;;
  test)  npm test ;;
  check)
    run lint npm run --silent lint
    run styles-size check_size styles.css 153600
    run bundle-size check_size main.js 307200
    run versions check_versions
    exit $failed ;;
  *) echo "usage: scripts/build.sh build|test|check" >&2; exit 2 ;;
esac
