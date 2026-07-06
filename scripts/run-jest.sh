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

experimental=false

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
      experimental=true
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

# appNewScrollHandler defaults to `true`. Non-experimental runs opt out so
# local runs mirror the non-experimental CI shards and keep coverage of the old
# scroll handler; experimental runs leave it on via the default. An explicit
# value in the environment is respected either way.
if [ "$experimental" != true ]; then
  export __NEXT_EXPERIMENTAL_APP_NEW_SCROLL_HANDLER="${__NEXT_EXPERIMENTAL_APP_NEW_SCROLL_HANDLER:-false}"
fi

# Resolves to `node_modules/.bin/jest` via `$PATH`. This relies on being
# invoked through pnpm (or another package runner), which prepends the
# workspace's `node_modules/.bin/` to `$PATH` before running the script.
exec jest --runInBand "$@"
