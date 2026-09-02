#!/usr/bin/env bash
set -euo pipefail

# Default TURBO_API to Vercel's public API when the workflow does not set it.
if [ -z "${TURBO_API:-}" ]; then
  export TURBO_API="https://api.vercel.com"
  echo "TURBO_API=${TURBO_API}" >> "$GITHUB_ENV"
fi

# Exported by `vercel/setup-turborepo-remote-cache-action`, and unset entirely
# when that step was skipped. Bind them so the substring expansions below don't
# trip `set -u`, which rejects an unset name even in `${var:0:3}`.
TURBO_TOKEN="${TURBO_TOKEN:-}"
TURBO_TEAM="${TURBO_TEAM:-}"

if [ -z "$TURBO_TOKEN" ]; then
  echo "WARNING: no TURBO_TOKEN available"
fi

echo "::add-mask::${TURBO_TOKEN}"
echo "Cache endpoint: ${TURBO_API:0:9}..."
echo "TURBO_TOKEN: ${TURBO_TOKEN:0:3}..."
echo "TURBO_TEAM: ${TURBO_TEAM}"

# Install vercel/sccache fork via cargo-binstall.
# cargo-binstall is installed by .github/actions/setup-rust.
cargo binstall --no-confirm --git https://github.com/vercel/sccache sccache
sccache --version

# Set env vars for the sccache server (export) and subsequent steps (GITHUB_ENV).
set_env() {
  export "$1=$2"
  echo "$1=$2" >> "$GITHUB_ENV"
}

# Temporary disable while we work out binstall issue
#set_env RUSTC_WRAPPER sccache
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
