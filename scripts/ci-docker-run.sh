#!/usr/bin/env bash

set -euo pipefail

IMAGE_NAME="${CI_DOCKER_IMAGE_NAME:-nextjs-ci-playwright:latest}"
WORKSPACE="${GITHUB_WORKSPACE:-$(pwd)}"
PNPM_STORE_DIR="${CI_PNPM_STORE_DIR:?CI_PNPM_STORE_DIR is required}"
CONTAINER_HOME_DIR="${CI_CONTAINER_HOME_DIR:?CI_CONTAINER_HOME_DIR is required}"
RUNNER_TEMP_DIR="${RUNNER_TEMP:-/tmp}"

mkdir -p "${PNPM_STORE_DIR}" "${CONTAINER_HOME_DIR}"

docker_args=(
  --rm
  --user "$(id -u):$(id -g)"
  -e HOME=/tmp/ci-home
  -e CI
  -e DD_ENV
  -e DATADOG_API_KEY
  -e GITHUB_SHA
  -e KV_REST_API_TOKEN
  -e KV_REST_API_URL
  -e CI_AFTER_BUILD
  -e DEFAULT_NODE_VERSION
  -e NEXT_CI_RUNNER
  -e NEXT_JUNIT_TEST_REPORT
  -e NEXT_SKIP_NATIVE_POSTINSTALL
  -e NEXT_TELEMETRY_DISABLED
  -e NEXT_TEST_JOB
  -e NEXT_TEST_PREFER_OFFLINE
  -e NEXT_TURBOPACK_IO_CONCURRENCY
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
  -e REQUESTED_NODE_VERSION
  -e RUST_BACKTRACE
  -e SHOULD_FETCH_TEST_TIMINGS
  -e SHOULD_SKIP_INSTALL_BUILD
  -e TEST_CONCURRENCY
  -e TURBO_ARGS
  -e TURBO_CACHE
  -e TURBO_TEAM
  -e TURBO_TOKEN
  -e TURBO_VERSION
  -e VERCEL_ADAPTER_TEST_TEAM
  -e VERCEL_ADAPTER_TEST_TOKEN
  -e VERCEL_TEST_TEAM
  -e VERCEL_TEST_TOKEN
  -e VERCEL_TURBOPACK_TEST_TEAM
  -e VERCEL_TURBOPACK_TEST_TOKEN
  -e BASELINE_BROWSER_MAPPING_IGNORE_OLD_DATA
  -e npm_config_store_dir=/pnpm-store
  -v "${WORKSPACE}:/work"
  -v "${PNPM_STORE_DIR}:/pnpm-store"
  -v "${CONTAINER_HOME_DIR}:/tmp/ci-home"
  -v "${RUNNER_TEMP_DIR}:/runner-temp"
  -w /work
)

for env_var in GITHUB_STEP_SUMMARY GITHUB_OUTPUT GITHUB_ENV GITHUB_PATH GITHUB_STATE; do
  env_value="${!env_var:-}"
  if [ -n "${env_value}" ]; then
    mkdir -p "$(dirname "${env_value}")"
    touch "${env_value}"
    docker_args+=(-e "${env_var}")
    docker_args+=(-v "$(dirname "${env_value}"):$(dirname "${env_value}")")
  fi
done

docker run "${docker_args[@]}" \
  "${IMAGE_NAME}" \
  env -u HOSTNAME bash -eo pipefail "$@"
