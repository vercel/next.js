#!/bin/bash
# Benchmark script for comparing web streams vs node streams performance.
# Runs autocannon multiple times and reports mean/stddev for each mode.
#
# Usage:
#   ./benchmark.sh [runs] [duration] [connections]
#
# Defaults: 5 runs, 10s duration, 50 connections

set -euo pipefail

RUNS=${1:-5}
DURATION=${2:-10}
CONNECTIONS=${3:-50}
PORT=3199
NEXT_BIN="../../packages/next/dist/bin/next"

if ! command -v npx &>/dev/null; then
  echo "npx is required"
  exit 1
fi

cleanup() {
  lsof -ti :"$PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true
}
trap cleanup EXIT

join_csv() {
  local IFS=','
  echo "$*"
}

run_benchmark() {
  local mode="$1"
  local rps_values=()
  local lat_values=()

  echo ""
  echo "=== $mode ==="
  echo "Running $RUNS iterations ($DURATION s each, $CONNECTIONS connections)"
  echo ""

  for i in $(seq 1 "$RUNS"); do
    NODE_ENV=production PORT=$PORT node "$NEXT_BIN" start -p "$PORT" &>/dev/null &
    local server_pid=$!
    sleep 2

    # Warm-up
    curl -s "http://localhost:$PORT" >/dev/null 2>&1 || true
    sleep 0.5

    local result
    result=$(npx autocannon -d "$DURATION" -c "$CONNECTIONS" -j "http://localhost:$PORT" 2>/dev/null)

    local rps lat
    rps=$(echo "$result" | node -e "
      const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      console.log(d.requests.average);
    ")
    lat=$(echo "$result" | node -e "
      const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      console.log(d.latency.average);
    ")

    rps_values+=("$rps")
    lat_values+=("$lat")

    printf "  Run %d: %s req/s  %.2f ms avg latency\n" "$i" "$rps" "$lat"

    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
    cleanup
    sleep 1
  done

  local rps_csv lat_csv
  rps_csv=$(join_csv "${rps_values[@]}")
  lat_csv=$(join_csv "${lat_values[@]}")

  node -e "
    const rps = [${rps_csv}];
    const lat = [${lat_csv}];
    const mean = arr => arr.reduce((a,b) => a+b, 0) / arr.length;
    const std = arr => {
      const m = mean(arr);
      return Math.sqrt(arr.reduce((s,v) => s + (v-m)**2, 0) / arr.length);
    };
    console.log('');
    console.log('  Req/s:   mean=' + mean(rps).toFixed(1) + '  stddev=' + std(rps).toFixed(1));
    console.log('  Latency: mean=' + mean(lat).toFixed(2) + 'ms  stddev=' + std(lat).toFixed(2) + 'ms');
  "
}

echo "Benchmark: web streams vs node streams"
echo "======================================="

# --- Web Streams (default) ---
cat > next.config.js <<'CONF'
module.exports = {
  experimental: {
    serverMinification: true,
  },
}
CONF

echo ""
echo "Building (web streams)..."
node "$NEXT_BIN" build &>/dev/null
run_benchmark "Web Streams (default)"

# --- Node Streams ---
cat > next.config.js <<'CONF'
module.exports = {
  experimental: {
    serverMinification: true,
    useNodeStreams: true,
  },
}
CONF

echo ""
echo "Building (node streams)..."
node "$NEXT_BIN" build &>/dev/null
run_benchmark "Node Streams (useNodeStreams: true)"

# Restore config
cat > next.config.js <<'CONF'
module.exports = {
  experimental: {
    serverMinification: true,
  },
}
CONF

echo ""
echo "Done."
