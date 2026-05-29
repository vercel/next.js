#!/usr/bin/env bash

# Run `test/e2e/app-dir/cache-components-errors/update-snapshots.sh` from the
# root of the monorepo to update the snapshots of the cache components errors
# test suite.

set -xeuo pipefail

SCRIPT_DIR=$(dirname "${BASH_SOURCE[0]-$0}")
TESTS=("$SCRIPT_DIR/cache-components-errors.test.ts")
DEV=false
START=false

# Parse CLI flags
for arg in "$@"; do
  case "$arg" in
    --dev)   DEV=true ;;
    --start) START=true ;;
    *)       echo "Unknown option: $arg"; exit 1 ;;
  esac
done

# If no flags are provided, update all snapshots.
if [ "$DEV" = false ] && [ "$START" = false ]; then
  DEV=true
  START=true
fi

# Update `next dev` snapshots for both Turbopack and Webpack.
if [ "$DEV" = true ]; then
  pnpm test-dev "${TESTS[@]}" --projects jest.config.* -u
fi

# The `next start` snapshots can't be created for both prerender modes at the
# same time because of an issue in the typescript plugin for prettier.
if [ "$START" = true ]; then
  NEXT_TEST_DEBUG_PRERENDER=false pnpm test-start "${TESTS[@]}" --projects jest.config.* -u
  NEXT_TEST_DEBUG_PRERENDER=true  pnpm test-start "${TESTS[@]}" --projects jest.config.* -u
fi
