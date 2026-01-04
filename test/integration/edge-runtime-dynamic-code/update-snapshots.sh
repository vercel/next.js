#!/bin/bash
# Update snapshots for both Turbopack and Webpack, then merge them.
# Usage: ./update-snapshots.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SNAP_FILE="$SCRIPT_DIR/test/__snapshots__/index.test.ts.snap"
TMP_DIR=$(mktemp -d)

echo "Generating Turbopack snapshots..."
IS_TURBOPACK_TEST=1 TURBOPACK_DEV=1 NEXT_TEST_MODE=dev pnpm jest test/integration/edge-runtime-dynamic-code/test/index.test.ts -u --silent
cp "$SNAP_FILE" "$TMP_DIR/turbopack.snap"

echo "Generating Webpack snapshots..."
IS_WEBPACK_TEST=1 NEXT_TEST_MODE=dev pnpm jest test/integration/edge-runtime-dynamic-code/test/index.test.ts -u --silent
cp "$SNAP_FILE" "$TMP_DIR/webpack.snap"

echo "Merging snapshots..."
{
  echo '// Jest Snapshot v1, https://goo.gl/fbAQLP'
  echo ''
  tail -n +3 "$TMP_DIR/turbopack.snap"
  tail -n +3 "$TMP_DIR/webpack.snap"
} > "$SNAP_FILE"

rm -rf "$TMP_DIR"

COUNT=$(grep -c 'exports\[' "$SNAP_FILE")
echo "Done! Merged $COUNT snapshots."
