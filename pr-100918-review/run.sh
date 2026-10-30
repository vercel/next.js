#!/usr/bin/env bash
# Runs PR #100918 review scenarios against this checkout's Next.js build.
#
#   pr-100918-review/run.sh <scenario>... [--webpack]
#   pr-100918-review/run.sh all
#
# Each fixture is created under test/tmp/review/<scenario> (gitignored) with
# its full log next to it. Scenarios run one at a time.
set -eo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/.." && pwd)"
next_bin="$repo/packages/next/dist/bin/next"
bundler_flag="--turbopack"
scenarios=()

for arg in "$@"; do
  case "$arg" in
    --webpack | --turbopack) bundler_flag="$arg" ;;
    all)
      for dir in "$here"/scenarios/*/; do
        scenarios+=("$(basename "$dir")")
      done
      ;;
    *) scenarios+=("$arg") ;;
  esac
done

if [ ${#scenarios[@]} -eq 0 ]; then
  echo "Usage: $0 <scenario>... [--webpack] | all" >&2
  ls "$here/scenarios" >&2
  exit 1
fi
if [ ! -f "$next_bin" ]; then
  echo "Missing $next_bin. Build the PR first (see README.md)." >&2
  exit 1
fi

for name in "${scenarios[@]}"; do
  src="$here/scenarios/$name"
  work="$repo/test/tmp/review/$name"
  if [ ! -d "$src" ]; then
    echo "Unknown scenario: $name" >&2
    exit 1
  fi

  rm -rf "$work"
  mkdir -p "$work"
  # copy-from names a repo directory to use as the fixture's app/ directory.
  if [ -f "$src/copy-from" ]; then
    cp -R "$repo/$(cat "$src/copy-from")" "$work/app"
  fi
  (cd "$src" && find . -type f ! -name steps.json ! -name copy-from) |
    while read -r file; do
      mkdir -p "$work/$(dirname "$file")"
      cp "$src/$file" "$work/$file"
    done
  sed "s|__REPO__|$repo|g" "$src/steps.json" >"$work.steps.json"

  echo "=== $name ($bundler_flag)"
  node "$here/drive-dev.mjs" "$next_bin" "$work" "$work.steps.json" \
    "$work.log" "$bundler_flag"
  echo "(full log: test/tmp/review/$name.log)"
  echo
done
