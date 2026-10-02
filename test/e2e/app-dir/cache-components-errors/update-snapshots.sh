#!/usr/bin/env bash

# Run `test/e2e/app-dir/cache-components-errors/update-snapshots.sh` from the
# root of the monorepo to update the snapshots of the cache components errors
# test suite.

set -xeuo pipefail

SCRIPT_DIR=$(dirname "${BASH_SOURCE[0]-$0}")
# One entry per section group. The `.partial-prefetching.` variants are
# intentionally omitted: they execute the same inline-snapshot call sites in
# the shared `*.util.ts` files, so updating the default entries covers both.
TESTS=(
  "$SCRIPT_DIR/metadata-and-viewport.test.ts"
  "$SCRIPT_DIR/sync-dynamic.test.ts"
  "$SCRIPT_DIR/error-attribution.test.ts"
  "$SCRIPT_DIR/use-cache.test.ts"
  "$SCRIPT_DIR/sync-io-time-and-random.test.ts"
  "$SCRIPT_DIR/sync-io-node-crypto.test.ts"
)
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
