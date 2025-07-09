#!/usr/bin/env bash

# Run `test/e2e/app-dir/dynamic-io-errors/update-snapshots.sh` from the root of
# the monorepo to update the snapshots of the dynamic IO errors test suite.

set -xeuo pipefail

SCRIPT_DIR=`dirname ${BASH_SOURCE[0]-$0}`
TESTS=("$SCRIPT_DIR/dynamic-io-errors.test.ts")

# Update dev snapshots for both Turbopack and Webpack.
pnpm test-dev "${TESTS[@]}" --projects jest.config.* -u

# Update start snapshots for Turbopack in both prerender modes together.
pnpm test-start-turbo "${TESTS[@]}" -u

# For Webpack, the snapshots can't be created for both prerender modes at the
# same time because of an issue in the typescript plugin for prettier.
NEXT_TEST_PRERENDER_DEBUG=false pnpm test-start "${TESTS[@]}" -u
NEXT_TEST_PRERENDER_DEBUG=true pnpm test-start "${TESTS[@]}" -u
