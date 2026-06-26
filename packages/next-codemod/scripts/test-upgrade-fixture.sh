#!/usr/bin/env bash
# Simple test runner for upgrade fixtures.
# For manual verification only (check the README.md) in the fixtures
# for the expected behavior.
# Usage:
# - cwd must be ~/packages/next-codemod
# - `pnpm test:upgrade-fixture <fixture-name> <...next-codemod-args>`

NEXT_CODEMOD_BIN=$(pwd)/bin/next-codemod.js
cd "$1" || exit 1
# We're only interested in the changes the upgrade command does.
git add -A .
rm -rf node_modules
pnpm install
node "$NEXT_CODEMOD_BIN" upgrade "${@:2}"
git --no-pager diff .
git restore .
git reset HEAD -- .
