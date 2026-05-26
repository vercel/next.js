#!/usr/bin/env bash
# Quiet, low-noise A/B Criterion bench runner for turbo-tasks-backend.
#
# Runs the same Cargo bench twice — once on a baseline ref (default: canary),
# once on the current working tree — under caffeinate + nice, with thermal/
# frequency telemetry recorded alongside each run.
#
# Usage:
#   sudo scripts/bench-quiet.sh                          # baseline=canary, filter=task_overhead/turbo
#   sudo scripts/bench-quiet.sh -b origin/canary
#   sudo scripts/bench-quiet.sh -f 'task_overhead/turbo-uncached'
#   sudo scripts/bench-quiet.sh -p turbo-tasks-backend -B mod -s 200
#
# Requires sudo for `nice -n -20` and `powermetrics`.

set -euo pipefail

PACKAGE="turbo-tasks-backend"
BENCH="mod"
FILTER="task_overhead/turbo"
SAMPLE_SIZE=200
BASELINE_REF="canary"
WARMUP_SECS=30
KEEP_GOING=0

usage() {
  sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

while getopts "p:B:f:s:b:w:kh" opt; do
  case "$opt" in
    p) PACKAGE="$OPTARG" ;;
    B) BENCH="$OPTARG" ;;
    f) FILTER="$OPTARG" ;;
    s) SAMPLE_SIZE="$OPTARG" ;;
    b) BASELINE_REF="$OPTARG" ;;
    w) WARMUP_SECS="$OPTARG" ;;
    k) KEEP_GOING=1 ;;
    h|*) usage ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  echo "error: must run under sudo (needed for nice -n -20 and powermetrics)" >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# Use SUDO_USER for the actual user's environment so cargo finds the right target dir, rustup toolchain, etc.
RUNUSER="${SUDO_USER:?must run via sudo, not as root directly}"
RUN_AS="sudo -E -u $RUNUSER"

OUT_DIR="$REPO_ROOT/.bench-runs/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT_DIR"
chown "$RUNUSER" "$OUT_DIR"

START_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
START_SHA="$(git rev-parse HEAD)"
BASELINE_SHA="$(git rev-parse "$BASELINE_REF")"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "error: working tree is dirty; commit or stash before running" >&2
  exit 1
fi

echo "==> bench-quiet starting"
echo "    package    : $PACKAGE"
echo "    bench      : $BENCH"
echo "    filter     : $FILTER"
echo "    samples    : $SAMPLE_SIZE"
echo "    baseline   : $BASELINE_REF ($BASELINE_SHA)"
echo "    branch HEAD: $START_BRANCH ($START_SHA)"
echo "    out dir    : $OUT_DIR"

# --- Environment hardening -----------------------------------------------------

ORIG_LOWPOWER_AC=""
ORIG_LOWPOWER_BAT=""
restore_env() {
  echo "==> restoring environment"
  if [[ -n "$ORIG_LOWPOWER_AC" ]]; then
    pmset -c lowpowermode "$ORIG_LOWPOWER_AC" 2>/dev/null || true
  fi
  if [[ -n "$ORIG_LOWPOWER_BAT" ]]; then
    pmset -b lowpowermode "$ORIG_LOWPOWER_BAT" 2>/dev/null || true
  fi
  mdutil -a -i on >/dev/null 2>&1 || true
  if [[ "$(git rev-parse --abbrev-ref HEAD)" != "$START_BRANCH" ]]; then
    echo "    git: returning to $START_BRANCH"
    git checkout -q "$START_BRANCH" || echo "    warning: failed to return to $START_BRANCH" >&2
  fi
}
trap restore_env EXIT

# Capture and disable low-power mode (best effort)
ORIG_LOWPOWER_AC="$(pmset -g custom 2>/dev/null | awk '/^AC Power/,/^Battery/' | awk '/lowpowermode/ {print $2}' | head -1 || true)"
ORIG_LOWPOWER_BAT="$(pmset -g custom 2>/dev/null | awk '/^Battery/,0' | awk '/lowpowermode/ {print $2}' | head -1 || true)"
pmset -c lowpowermode 0 2>/dev/null || true
pmset -b lowpowermode 0 2>/dev/null || true

# Pause Spotlight; index churn is a known stall source.
mdutil -a -i off >/dev/null 2>&1 || true

# --- Helpers -------------------------------------------------------------------

start_powermetrics() {
  local logfile="$1"
  # 1 Hz sample; smc=fan/temps, cpu_power=freq + active residency.
  powermetrics --samplers smc,cpu_power -i 1000 -o "$logfile" >/dev/null 2>&1 &
  echo $!
}

stop_powermetrics() {
  local pid="$1"
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
}

thermal_summary() {
  local logfile="$1"
  echo "    thermal pressure events:"
  if grep -Eq 'CPU Thermal level|Thermal pressure: [^N]' "$logfile" 2>/dev/null; then
    grep -E 'CPU Thermal level|Thermal pressure: [^N]' "$logfile" | sort -u | head -5 | sed 's/^/      /'
  else
    echo "      none recorded"
  fi
  echo "    pmset post-run therm state:"
  pmset -g therm | sed 's/^/      /'
}

run_one() {
  local label="$1"     # "baseline" | "branch"
  local ref="$2"
  local sha="$3"
  local criterion_arg="$4"  # --save-baseline NAME for baseline, --baseline NAME for branch

  echo
  echo "==> [$label] checking out $ref ($sha)"
  git checkout -q "$ref"

  echo "==> [$label] building bench (no instrumentation; release)"
  # Build first so the bench step is pure measurement.
  $RUN_AS cargo build --release -p "$PACKAGE" --bench "$BENCH" 2>&1 \
    | tee "$OUT_DIR/$label.build.log" | tail -3

  echo "==> [$label] cooldown ${WARMUP_SECS}s (let SoC settle)"
  sleep "$WARMUP_SECS"

  local pm_log="$OUT_DIR/$label.powermetrics.log"
  local bench_log="$OUT_DIR/$label.bench.log"
  echo "==> [$label] running bench (sample-size=$SAMPLE_SIZE, filter=$FILTER)"
  local pm_pid
  pm_pid="$(start_powermetrics "$pm_log")"

  # Bench args:
  #   --save-baseline N     baseline run: store under name N
  #   --baseline N          branch run: diff against previously-saved baseline N
  #                         (Criterion prints `change:` lines only with --baseline)
  #   -- $FILTER            criterion filter (positional after --)
  #   --sample-size N       widen sample count for tighter CIs
  local rc=0
  caffeinate -dimsu nice -n -20 \
    $RUN_AS cargo bench -p "$PACKAGE" --bench "$BENCH" -- \
      "$FILTER" --sample-size "$SAMPLE_SIZE" $criterion_arg \
    >"$bench_log" 2>&1 || rc=$?

  stop_powermetrics "$pm_pid"

  if [[ $rc -ne 0 ]]; then
    echo "    bench exited with rc=$rc; tail of $bench_log:" >&2
    tail -20 "$bench_log" >&2
    if [[ $KEEP_GOING -eq 0 ]]; then exit "$rc"; fi
  fi

  thermal_summary "$pm_log"
}

# --- Run -----------------------------------------------------------------------

BASELINE_NAME="bench-quiet-baseline"
run_one baseline "$BASELINE_REF"  "$BASELINE_SHA" "--save-baseline $BASELINE_NAME"
run_one branch   "$START_BRANCH"  "$START_SHA"    "--baseline $BASELINE_NAME"

# --- Summary -------------------------------------------------------------------

echo
echo "==> done"
echo "    artifacts: $OUT_DIR"
echo "    re-diff later with:"
echo "      cargo bench -p $PACKAGE --bench $BENCH -- $FILTER --baseline $BASELINE_NAME"
echo
echo "    comparison ('change' line per benchmark, branch vs baseline):"
grep -E '^(test |task_overhead/| +time:| +change:|Performance has)' "$OUT_DIR/branch.bench.log" \
  | sed 's/^/      /' | head -120 || true
