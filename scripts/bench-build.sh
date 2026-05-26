#!/usr/bin/env bash
# Run `pnpm next build` N times in the current working directory, capturing
# wall / user / sys time and MaxRSS per run. Prints a summary table at the end.
#
# Designed to complement hyperfine — hyperfine times the wall clock well but
# doesn't track memory.
#
# Usage:
#   sudo scripts/bench-build.sh                              # 5 runs + 1 warmup, default cmd
#   sudo scripts/bench-build.sh -r 15 -w 2
#   sudo scripts/bench-build.sh -c 'pnpm next build --experimental-build-mode=compile'
#   sudo scripts/bench-build.sh -o /tmp/my-baseline.txt      # named output log
#
# Defaults match a typical hyperfine invocation: TURBOPACK_PERSISTENT_CACHE=0,
# experimental compile mode, `rm -rf .next` between runs.
#
# Requires sudo so the script can:
#   - lower nice (-20) for the build (real scheduling-priority bump)
#   - toggle Spotlight indexing off for the run
#   - toggle Low Power Mode off for the run
# All of these are reverted on exit.

set -euo pipefail

RUNS=5
WARMUP=1
CMD='TURBOPACK_PERSISTENT_CACHE=0 pnpm next build --experimental-build-mode=compile'
OUT=""
PREPARE='rm -rf .next'
COOLDOWN=5

usage() {
  sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

while getopts "r:w:c:o:p:t:h" opt; do
  case "$opt" in
    r) RUNS="$OPTARG" ;;
    w) WARMUP="$OPTARG" ;;
    c) CMD="$OPTARG" ;;
    o) OUT="$OPTARG" ;;
    p) PREPARE="$OPTARG" ;;
    t) COOLDOWN="$OPTARG" ;;
    h|*) usage ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  echo "error: must run under sudo (needed for nice -n -20 and pmset/mdutil)" >&2
  exit 1
fi

# /usr/bin/time -l is the BSD time; the bash builtin doesn't support -l.
TIME=/usr/bin/time
if [[ ! -x "$TIME" ]]; then
  echo "error: $TIME not found (need BSD time -l for MaxRSS)" >&2
  exit 1
fi

# Run the build itself as the invoking user, not root. pnpm/node configuration,
# the user's pnpm store, ~/.cache, etc. all live under $HOME and would be
# polluted by root if we didn't drop privilege.
RUNUSER="${SUDO_USER:?must run via sudo, not as root directly}"
RUNUSER_HOME="$(eval echo "~$RUNUSER")"
RUN_AS=(sudo -E -u "$RUNUSER" -H)

if [[ -z "$OUT" ]]; then
  OUT="$(pwd)/.bench-build-$(date +%Y%m%d-%H%M%S).log"
fi

echo "==> bench-build"
echo "    cwd      : $(pwd)"
echo "    user     : $RUNUSER (home: $RUNUSER_HOME)"
echo "    cmd      : $CMD"
echo "    prepare  : $PREPARE"
echo "    warmup   : $WARMUP"
echo "    runs     : $RUNS"
echo "    cooldown : ${COOLDOWN}s between runs"
echo "    log      : $OUT"
: > "$OUT"
chown "$RUNUSER" "$OUT"

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
}
trap restore_env EXIT

ORIG_LOWPOWER_AC="$(pmset -g custom 2>/dev/null | awk '/^AC Power/,/^Battery/' | awk '/lowpowermode/ {print $2}' | head -1 || true)"
ORIG_LOWPOWER_BAT="$(pmset -g custom 2>/dev/null | awk '/^Battery/,0' | awk '/lowpowermode/ {print $2}' | head -1 || true)"
pmset -c lowpowermode 0 2>/dev/null || true
pmset -b lowpowermode 0 2>/dev/null || true

# Pause Spotlight; index churn is a known stall source on large repos.
mdutil -a -i off >/dev/null 2>&1 || true

# Per-run capture file used inside the loop; each run rewrites it.
PER_RUN="$(mktemp -t bench-build-run.XXXXXX)"
trap 'rm -f "$PER_RUN"' EXIT

# Arrays for the real (non-warmup) runs.
# user/sys come from /usr/bin/time -lp's `user`/`sys` lines, which aggregate
# CPU time across the whole process tree (same RUSAGE_CHILDREN source as
# MaxRSS). They're typically less noisy than wall time because they
# excludes scheduler/IO jitter.
declare -a WALL_S USER_S SYS_S MAXRSS_B

# Returns "" if the field isn't present.
extract_field() {
  # $1 = file, $2 = field text (e.g. "maximum resident set size")
  # BSD time -l format: <number><space>field
  awk -v want="$2" '
    {
      # find the literal field anywhere after column 1
      idx = index($0, want)
      if (idx > 0) {
        # the number is the first whitespace-separated token before "want"
        # i.e. the leading column
        n = $1
        gsub(/[^0-9]/, "", n)
        if (n != "") { print n; exit }
      }
    }' "$1"
}

run_once() {
  local label="$1"
  local run_idx="$2"
  echo "==> $label run $run_idx"
  echo "    prepare: $PREPARE"
  "${RUN_AS[@]}" bash -c "$PREPARE" >>"$OUT" 2>&1

  if (( COOLDOWN > 0 )); then
    echo "    cooldown ${COOLDOWN}s ..."
    sleep "$COOLDOWN"
  fi

  echo "    running ..."

  # Capture: time + memory stats from /usr/bin/time -lp.
  # -lp uses the POSIX one-token-per-line format ("real <s>" / "user <s>" /
  # "sys <s>") which is much easier to parse than the default `<s> real <s>
  # user <s> sys` block. -l still adds the rusage block below.
  #
  # Wrapping:
  #   caffeinate -dimsu  — prevent display/idle/disk sleep during the run
  #   nice -n -20        — highest scheduling priority (requires root, which we have)
  #   sudo -E -u <user>  — drop privilege so pnpm/node use the user's HOME/caches
  #   /usr/bin/time -lp  — gather wall/user/sys + rusage block (sudo passes args through)
  #
  # We must `nice` *before* dropping privilege: nice -n -20 needs root.
  # `sudo -u <user>` preserves the nice value into the child.
  # stderr (time's report) is captured to PER_RUN; stdout (build output) appends to OUT.
  local rc=0
  caffeinate -dimsu nice -n -20 \
    "${RUN_AS[@]}" "$TIME" -lp bash -c "$CMD" \
    >>"$OUT" 2>"$PER_RUN" || rc=$?

  if [[ $rc -ne 0 ]]; then
    echo "    build failed (rc=$rc); tail of log:" >&2
    tail -30 "$OUT" >&2
    echo "    time -l output:" >&2
    cat "$PER_RUN" >&2
    exit "$rc"
  fi

  # -lp emits "real <s>" / "user <s>" / "sys <s>" as the first three lines.
  local real_s user_s sys_s
  real_s="$(awk '$1=="real" {print $2; exit}' "$PER_RUN")"
  user_s="$(awk '$1=="user" {print $2; exit}' "$PER_RUN")"
  sys_s="$(awk '$1=="sys"  {print $2; exit}' "$PER_RUN")"
  # MaxRSS aggregates across the whole process tree via RUSAGE_CHILDREN, so it
  # captures the real `pnpm -> node -> next build` cost. We deliberately
  # *don't* read `peak memory footprint`: that field is reported only for the
  # single direct child PID (the short-lived shell wrapper), not the tree.
  local maxrss
  maxrss="$(extract_field "$PER_RUN" "maximum resident set size")"

  printf '    real=%ss  user=%ss  sys=%ss  maxrss=%s\n' \
    "$real_s" "$user_s" "$sys_s" "$(human_bytes "$maxrss")"

  # Append the full time -l block to the main log for auditability.
  {
    echo
    echo "--- $label run $run_idx ---"
    cat "$PER_RUN"
  } >>"$OUT"

  if [[ "$label" == "run" ]]; then
    WALL_S+=("$real_s")
    USER_S+=("$user_s")
    SYS_S+=("$sys_s")
    MAXRSS_B+=("$maxrss")
  fi
}

human_bytes() {
  local b="$1"
  [[ -z "$b" ]] && { echo "?"; return; }
  awk -v b="$b" 'BEGIN {
    if (b < 1024)               printf "%d B",   b
    else if (b < 1024*1024)     printf "%.1f KB", b/1024
    else if (b < 1024*1024*1024) printf "%.1f MB", b/1024/1024
    else                        printf "%.2f GB", b/1024/1024/1024
  }'
}

stats() {
  # arr_name unit_label divisor decimals
  local name="$1" unit="$2" div="$3" dec="$4"
  local -n arr="$name"
  awk -v n="${#arr[@]}" -v dec="$dec" -v div="$div" -v unit="$unit" '
    BEGIN { sum=0; min=1e30; max=0 }
    { v=$1+0; vals[NR]=v; sum+=v; if (v<min) min=v; if (v>max) max=v }
    END {
      if (n==0) { print "  (no data)"; exit }
      mean = sum/n
      sd = 0
      for (i=1;i<=n;i++) { d=vals[i]-mean; sd += d*d }
      sd = (n>1) ? sqrt(sd/(n-1)) : 0
      printf "  mean   %10.*f %s\n", dec, mean/div, unit
      printf "  stddev %10.*f %s  (%.1f%%)\n", dec, sd/div, unit, (mean>0?100*sd/mean:0)
      printf "  min    %10.*f %s\n", dec, min/div, unit
      printf "  max    %10.*f %s\n", dec, max/div, unit
    }' < <(printf '%s\n' "${arr[@]}")
}

# --- Run -----------------------------------------------------------------------

for ((i=1; i<=WARMUP; i++)); do
  run_once warmup "$i"
done

for ((i=1; i<=RUNS; i++)); do
  run_once run "$i"
done

# --- Summary -------------------------------------------------------------------

echo
echo "==> summary across $RUNS runs"
echo "wall time (s):"
stats WALL_S   "s"  1            3
echo "user time (s):"
stats USER_S   "s"  1            3
echo "sys time (s):"
stats SYS_S    "s"  1            3
echo "MaxRSS:"
stats MAXRSS_B "MB" $((1024*1024)) 1
echo
echo "per-run csv:"
echo "  run,wall_s,user_s,sys_s,maxrss_bytes"
for ((i=0; i<RUNS; i++)); do
  printf '  %d,%s,%s,%s,%s\n' "$((i+1))" \
    "${WALL_S[$i]}" "${USER_S[$i]}" "${SYS_S[$i]}" "${MAXRSS_B[$i]}"
done

echo
echo "==> done (full log: $OUT)"
