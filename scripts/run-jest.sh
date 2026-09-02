#!/usr/bin/env bash
#
# Set up environment variables for a Next.js jest test run and exec jest
# in a single hop, replacing this shell process.
#
# Usage:
#   scripts/run-jest.sh \
#     [--mode=<dev|start|deploy>] \
#     [--bundler=<webpack|turbo|rspack>] \
#     [--experimental] \
#     [--headless] \
#     -- [jest args...]
#
# All arguments after `--` are forwarded verbatim to jest.

set -eo pipefail

while [ $# -gt 0 ]; do
  case "$1" in
    --mode=dev|--mode=start|--mode=deploy)
      export NEXT_TEST_MODE="${1#--mode=}"
      ;;
    --mode=*)
      echo "run-jest.sh: unknown mode: ${1#--mode=}" >&2
      exit 1
      ;;
    --bundler=webpack)
      export IS_WEBPACK_TEST=1
      ;;
    --bundler=turbo)
      export IS_TURBOPACK_TEST=1
      ;;
    --bundler=rspack)
      export NEXT_RSPACK=1
      export NEXT_TEST_USE_RSPACK=1
      ;;
    --bundler=*)
      echo "run-jest.sh: unknown bundler: ${1#--bundler=}" >&2
      exit 1
      ;;
    --experimental)
      export __NEXT_CACHE_COMPONENTS=true
      ;;
    --headless)
      export HEADLESS=true
      ;;
    --)
      shift
      break
      ;;
    *)
      echo "run-jest.sh: unknown argument: $1" >&2
      exit 1
      ;;
  esac
  shift
done

# `__NEXT_TEST_AXIS` names the alternate flag configurations of the test
# matrix. Axes are lettered (`A`, `B`, …) — a fixed enumeration a fixture opts
# into, not a boolean, and not one of the buckets test *sharding* splits a run
# into. CI runs the suites once plainly and once per axis, and a fixture keys
# an experimental flag on an axis to cover both states of the flag — enabled
# by default, disabled on that axis:
#
#   experimental: {
#     concurrentRouterQueue: process.env.__NEXT_TEST_AXIS !== 'A',
#   }
#
# paired with a `// @gate concurrentRouterQueue` on the affected tests: a
# plain run — including a local run with no special env — exercises the
# feature, and the axis run covers the off state (see
# test/lib/gate/README.md).
#
# For now there is a single axis, `A`, and it is an alias for
# `__NEXT_CACHE_COMPONENTS` (the `--experimental` run) rather than a CI
# dimension of its own. That works because most experiments hard-code
# `cacheComponents: true` in their fixture anyway — the cache-components env
# default only applies to fixtures that don't set it themselves, so for these
# fixtures that run is free to double as the axis run. Setting either name
# implies the other.
if [ -n "${__NEXT_TEST_AXIS:-}" ]; then
  export __NEXT_CACHE_COMPONENTS=true
elif [ "${__NEXT_CACHE_COMPONENTS:-}" = "true" ]; then
  export __NEXT_TEST_AXIS=A
fi

# Resolves to `node_modules/.bin/jest` via `$PATH`. This relies on being
# invoked through pnpm (or another package runner), which prepends the
# workspace's `node_modules/.bin/` to `$PATH` before running the script.
exec jest --runInBand "$@"
