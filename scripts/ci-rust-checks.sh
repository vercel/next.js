#!/usr/bin/env bash
#
# Reproduce the Rust-related CI jobs locally.
#
# Mirrors the commands run in:
#   - .github/workflows/build_and_test.yml           (test-cargo-unit, rust-check, rustdoc-check)
#   - .github/workflows/test-turbopack-rust-bench-test.yml  (test-bench)
#
# Each "step" is a single CI job. Pass a step name as the first arg to run
# only that step; pass nothing to run all of them in CI order.
#
# Usage:
#   ./scripts/ci-rust-checks.sh                  # run every step in order
#   ./scripts/ci-rust-checks.sh fmt              # one step
#   ./scripts/ci-rust-checks.sh bench-build      # build the bench targets only
#   ./scripts/ci-rust-checks.sh list             # list available step names
#
# All commands run from the repo root. Output for each step is tee'd to
# /tmp/ci-rust-<step>.log so you can re-read without re-running.

set -uo pipefail

# Resolve the repo root so the script works from any cwd.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Log directory.
LOG_DIR="/tmp/ci-rust-checks"
mkdir -p "$LOG_DIR"

# ---- step definitions -----------------------------------------------------
#
# Each step is one CI command. Keeping them in functions makes it easy to
# run a single one in isolation.

step_fmt() {
  # rust-check / cargo fmt -- --check
  echo "[fmt] cargo fmt -- --check"
  cargo fmt -- --check
}

step_clippy() {
  # rust-check / cargo clippy
  echo "[clippy] cargo clippy --workspace --all-targets -- -D warnings -A deprecated"
  cargo clippy --workspace --all-targets -- -D warnings -A deprecated
}

step_check_napi() {
  # rust-check-napi
  echo "[check-napi] cargo check -p next-napi-bindings"
  cargo check -p next-napi-bindings
}

step_doc() {
  # rustdoc-check
  echo "[doc] cargo doc --no-deps --workspace (with JSON output flags)"
  RUSTDOCFLAGS='-Zunstable-options --output-format=json' \
    cargo doc --no-deps --workspace
}

step_unit_build() {
  # test-cargo-unit, build phase only.
  echo "[unit-build] cargo nextest run --no-run (release-with-assertions)"
  cargo nextest run \
    --workspace \
    --exclude next-napi-bindings \
    --exclude turbo-tasks-macros \
    --cargo-profile release-with-assertions \
    --no-fail-fast \
    --no-run
}

step_unit() {
  # test-cargo-unit, full run.
  echo "[unit] cargo nextest run (release-with-assertions)"
  cargo nextest run \
    --workspace \
    --exclude next-napi-bindings \
    --exclude turbo-tasks-macros \
    --cargo-profile release-with-assertions \
    --no-fail-fast
}

step_bench_build() {
  # test-bench, build phase. This is the step that catches link-time issues
  # in benches without running them — fastest signal for the providers/decls
  # contract.
  echo "[bench-build] cargo test --benches --no-run --release (workspace minus turbopack-bench, next-napi-bindings)"
  cargo test --benches --workspace --release --no-fail-fast \
    --exclude turbopack-bench \
    --exclude next-napi-bindings \
    --no-run
}

step_bench() {
  # test-bench, full run.
  echo "[bench] cargo test --benches --release (workspace minus turbopack-bench, next-napi-bindings)"
  cargo test --benches --workspace --release --no-fail-fast \
    --exclude turbopack-bench \
    --exclude next-napi-bindings
}

step_bench_turbopack_build() {
  echo "[bench-turbopack-build] cargo test --benches --release -p turbopack-bench --no-run"
  cargo test --benches --release -p turbopack-bench --no-run
}

step_bench_turbopack() {
  echo "[bench-turbopack] cargo test --benches --release -p turbopack-bench"
  cargo test --benches --release -p turbopack-bench
}

# ---- runner ---------------------------------------------------------------

STEPS=(
  fmt
  check_napi
  clippy
  doc
  unit_build
  bench_build
  unit
  bench
  bench_turbopack_build
  bench_turbopack
)

list_steps() {
  echo "Available steps (CI order):"
  for s in "${STEPS[@]}"; do
    echo "  - ${s//_/-}"
  done
}

run_step() {
  local name="$1"
  local fn="step_${name//-/_}"
  if ! declare -F "$fn" > /dev/null; then
    echo "unknown step: $name" >&2
    list_steps
    return 2
  fi

  local log="$LOG_DIR/$name.log"
  echo "==> $name (log: $log)"
  if "$fn" 2>&1 | tee "$log"; then
    echo "    PASS"
    return 0
  else
    local rc="${PIPESTATUS[0]}"
    echo "    FAIL (exit $rc) — full log at $log"
    return "$rc"
  fi
}

run_all() {
  local failed=()
  for s in "${STEPS[@]}"; do
    if ! run_step "$s"; then
      failed+=("$s")
    fi
  done

  echo
  if (( ${#failed[@]} == 0 )); then
    echo "All steps passed."
  else
    echo "FAILED steps: ${failed[*]}"
    return 1
  fi
}

case "${1:-all}" in
  all)         run_all ;;
  list)        list_steps ;;
  -h|--help)   sed -n '2,18p' "${BASH_SOURCE[0]}" ;;
  *)           run_step "$1" ;;
esac
