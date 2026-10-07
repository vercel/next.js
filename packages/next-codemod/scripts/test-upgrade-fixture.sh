#!/usr/bin/env bash
# Simple test runner for upgrade fixtures.
# For manual verification only (check the README.md) in the fixtures
# for the expected behavior.
# Usage:
# - cwd must be ~/packages/next-codemod, and packages/next-upgrade must be built
# - `pnpm test:upgrade-fixture <fixture-name> <...next-upgrade-args>`
#   e.g. `pnpm test:upgrade-fixture bin/__testfixtures__/next-14-installed --revision 15.0.0`
#
# The upgrade itself lives in @next/upgrade, so this runs the local
# @next/upgrade build directly.

NEXT_UPGRADE_BIN=$(pwd)/../next-upgrade/bin/next-upgrade.js
cd "$1" || exit 1
# We're only interested in the changes the upgrade command does.
git add -A .
rm -rf node_modules
pnpm install
node "$NEXT_UPGRADE_BIN" "${@:2}"
git --no-pager diff .
git restore .
git reset HEAD -- .
