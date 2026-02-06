#!/bin/bash
# Benchmark script for comparing web streams vs node streams performance.
# Uses the minimal server (bench/next-minimal-server) for lowest overhead.
# Warms up with 50 requests, then runs two phases:
#   Phase 1: 10s at concurrency=1   (single-client latency)
#   Phase 2: 10s at concurrency=100 (throughput under load)
# Reports throughput and latency percentiles for each phase.
#
# Usage:
#   ./benchmark.sh [duration] [warmup_requests]
#
# Defaults: 10s duration per phase, 50 warmup requests

set -euo pipefail

DURATION=${1:-10}
WARMUP_REQS=${2:-50}
PORT=3199
NEXT_BIN="../../packages/next/dist/bin/next"
MINIMAL_SERVER="../next-minimal-server/bin/minimal-server.js"

if ! command -v npx &>/dev/null; then
  echo "npx is required (for autocannon)"
  exit 1
fi

cleanup() {
  lsof -ti :"$PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true
}
trap cleanup EXIT

start_server() {
  cleanup
  sleep 0.5
  PORT=$PORT node "$MINIMAL_SERVER" &>/dev/null &
  SERVER_PID=$!

  # Wait for server to be ready
  local retries=0
  while ! curl -sf "http://localhost:$PORT" >/dev/null 2>&1; do
    retries=$((retries + 1))
    if [ "$retries" -gt 30 ]; then
      echo "ERROR: Server failed to start after 15s"
      exit 1
    fi
    sleep 0.5
  done
}

stop_server() {
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  cleanup
  sleep 1
}

warmup() {
  echo "  Warming up ($WARMUP_REQS requests)..."
  for i in $(seq 1 "$WARMUP_REQS"); do
    curl -sf "http://localhost:$PORT" >/dev/null 2>&1 || true
  done
  sleep 0.5
}

run_phase() {
  local label="$1"
  local connections="$2"

  echo ""
  echo "  --- $label (${DURATION}s, c=$connections) ---"

  local result
  result=$(npx autocannon -d "$DURATION" -c "$connections" -j "http://localhost:$PORT" 2>/dev/null)

  node -e "
    const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    const r = d.requests;
    const l = d.latency;
    console.log('  Throughput:');
    console.log('    avg: ' + r.average + ' req/s');
    console.log('    mean: ' + r.mean + ' req/s');
    console.log('    total: ' + r.total + ' requests in ${DURATION}s');
    console.log('  Latency:');
    console.log('    avg:  ' + l.average.toFixed(2) + ' ms');
    console.log('    p50:  ' + l.p50.toFixed(2) + ' ms');
    console.log('    p90:  ' + l.p90.toFixed(2) + ' ms');
    console.log('    p99:  ' + l.p99.toFixed(2) + ' ms');
    console.log('    max:  ' + l.max.toFixed(2) + ' ms');
  " <<< "$result"
}

run_benchmark() {
  local mode="$1"

  echo ""
  echo "============================================"
  echo "  $mode"
  echo "============================================"

  start_server
  warmup
  run_phase "Single client" 1
  run_phase "Under load" 100
  stop_server
}

echo "Benchmark: web streams vs node streams"
echo "======================================="
echo "Duration: ${DURATION}s per phase | Warmup: ${WARMUP_REQS} reqs"
echo "Server: minimal-server (minimalMode: true)"

# --- Web Streams (default) ---
cat > next.config.js <<'CONF'
module.exports = {}
CONF

echo ""
echo "Building (web streams)..."
node "$NEXT_BIN" build &>/dev/null
run_benchmark "Web Streams (default)"

# --- Node Streams ---
cat > next.config.js <<'CONF'
module.exports = {
  experimental: {
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
module.exports = {}
CONF

echo ""
echo "Done."
