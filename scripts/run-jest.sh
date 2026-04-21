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
      export __NEXT_EXPERIMENTAL_APP_NEW_SCROLL_HANDLER=true
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

# Resolves to `node_modules/.bin/jest` via `$PATH`. This relies on being
# invoked through pnpm (or another package runner), which prepends the
# workspace's `node_modules/.bin/` to `$PATH` before running the script.
exec jest --runInBand "$@"
