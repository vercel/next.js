#!/usr/bin/env bash
set -euo pipefail

# Normalize TURBO_API and TURBO_TOKEN: prefer runner .bashrc values,
# fall back to Vercel's public API and the secret passed as an action input.
if [ -z "${TURBO_API:-}" ]; then
  export TURBO_API="https://api.vercel.com"
  echo "TURBO_API=${TURBO_API}" >> "$GITHUB_ENV"
fi

if [ -z "${TURBO_TOKEN:-}" ]; then
  if [ -n "${INPUT_TURBO_TOKEN:-}" ]; then
    export TURBO_TOKEN="${INPUT_TURBO_TOKEN}"
    echo "TURBO_TOKEN=${TURBO_TOKEN}" >> "$GITHUB_ENV"
  else
    echo "WARNING: no TURBO_TOKEN available"
  fi
fi

if [ -z "${TURBO_TEAM:-}" ]; then
  export TURBO_TEAM="vercel"
  echo "TURBO_TEAM=${TURBO_TEAM}" >> "$GITHUB_ENV"
fi

echo "::add-mask::${TURBO_TOKEN:-}"
echo "Cache endpoint: ${TURBO_API:0:9}..."
echo "TURBO_TOKEN: ${TURBO_TOKEN:0:3}..."
echo "TURBO_TEAM: ${TURBO_TEAM}"

# Kill stale processes from cancelled builds on self-hosted runners.
sccache --stop-server 2>/dev/null || true
pkill -9 -x cargo 2>/dev/null || true
pkill -9 -x rustc 2>/dev/null || true

# Install sccache via turbo task (cached by scripts/sccache-version).
TURBO="pnpm dlx turbo@${TURBO_VERSION:-latest}"
$TURBO run build-sccache ${TURBO_ARGS:-}
SCCACHE_PATH="${GITHUB_WORKSPACE}/target/sccache/bin"
export PATH="${SCCACHE_PATH}:${PATH}"
echo "${SCCACHE_PATH}" >> "$GITHUB_PATH"
sccache --version

# Set env vars for the sccache server (export) and subsequent steps (GITHUB_ENV).
set_env() {
  export "$1=$2"
  echo "$1=$2" >> "$GITHUB_ENV"
}

set_env RUSTC_WRAPPER sccache
set_env SCCACHE_BASEDIRS "${INPUT_BASE_DIR:-${GITHUB_WORKSPACE}}"
set_env CARGO_INCREMENTAL 0
set_env SCCACHE_IDLE_TIMEOUT 0
set_env SCCACHE_DIR "${HOME}/.sccache"
set_env SCCACHE_RUST_CRATE_TYPE_ALLOW_HASH v1
set_env SCCACHE_ERROR_LOG "${RUNNER_TEMP:-/tmp}/sccache-error.log"

# Gracefully fall back to local compilation if the remote cache is unreachable.
set_env SCCACHE_IGNORE_SERVER_IO_ERROR 1

# Configure remote cache if token is available, otherwise disk-only.
if [ -n "${TURBO_TOKEN:-}" ]; then
  set_env SCCACHE_MULTILEVEL_CHAIN "disk,vercel_artifacts"
  set_env SCCACHE_VERCEL_ARTIFACTS_ENDPOINT "${TURBO_API}"
  set_env SCCACHE_VERCEL_ARTIFACTS_TOKEN "${TURBO_TOKEN}"
  set_env SCCACHE_VERCEL_ARTIFACTS_TEAM_SLUG "${TURBO_TEAM}"
fi

# Start the sccache daemon.
echo "SCCACHE_BASEDIRS=${SCCACHE_BASEDIRS}"
sccache --start-server 2>&1 || echo "WARNING: sccache failed to start"
sccache --show-stats 2>&1 | grep -E "Cache location|Base directories" || true
