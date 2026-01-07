#!/bin/bash
#
# Benchmark dev server boot time (wall-clock)
#
# Measures TWO metrics:
#   1. listen_time: When server starts accepting TCP connections
#   2. ready_time: When server responds to first HTTP request
#
# The delta between these shows how much initialization is deferred after "Ready".
#
# Usage:
#   ./scripts/benchmark-boot-time.sh [runs] [test-dir]
#
# Examples:
#   ./scripts/benchmark-boot-time.sh           # 5 runs, uses /tmp/next-boot-test
#   ./scripts/benchmark-boot-time.sh 3         # 3 runs
#   ./scripts/benchmark-boot-time.sh 5 ./my-app  # 5 runs on existing app

set -e

RUNS=${1:-5}
TEST_DIR=${2:-/tmp/next-boot-test}
NEXT_BIN="$(dirname "$0")/../packages/next/dist/bin/next"
PORT=3456

echo "=== Dev Server Boot Time Benchmark ==="
echo "Runs: $RUNS"
echo "Test dir: $TEST_DIR"
echo "Next.js: $NEXT_BIN"
echo ""
echo "Metrics:"
echo "  listen_time: TCP port accepting connections"
echo "  ready_time:  First HTTP request succeeds"
echo "  delta:       ready_time - listen_time (deferred init)"
echo ""

# Create test app if it doesn't exist
if [ ! -f "$TEST_DIR/package.json" ]; then
  echo "Creating test app..."
  mkdir -p "$TEST_DIR/app"
  cat > "$TEST_DIR/package.json" << 'EOF'
{
  "name": "boot-test",
  "private": true,
  "dependencies": {
    "react": "19.0.0",
    "react-dom": "19.0.0"
  }
}
EOF
  cat > "$TEST_DIR/app/layout.tsx" << 'EOF'
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html><body>{children}</body></html>
}
EOF
  cat > "$TEST_DIR/app/page.tsx" << 'EOF'
export default function Home() { return <h1>Hello</h1> }
EOF
  (cd "$TEST_DIR" && npm install --silent)
  # Link local next
  (cd "$TEST_DIR" && npm link "$(dirname "$NEXT_BIN")/.." 2>/dev/null || true)
fi

# Kill any existing next dev on our port
pkill -f "next dev.*$PORT" 2>/dev/null || true
sleep 0.5

# Returns: listen_time,ready_time (comma-separated)
benchmark_run() {
  local label=$1
  local clean_next=$2

  if [ "$clean_next" = "true" ]; then
    rm -rf "$TEST_DIR/.next"
  fi

  # Measure wall-clock time from command start
  local start_time=$(python3 -c 'import time; print(int(time.time() * 1000))')

  "$NEXT_BIN" dev --turbopack --port $PORT "$TEST_DIR" > /dev/null 2>&1 &
  local pid=$!

  local timeout=600  # 30s at 50ms intervals
  local listen_time=""
  local ready_time=""

  # Phase 1: Wait for port to be listening (nc -z)
  for i in $(seq 1 $timeout); do
    if nc -z localhost $PORT 2>/dev/null; then
      listen_time=$(python3 -c 'import time; print(int(time.time() * 1000))')
      break
    fi
    sleep 0.05
  done

  # Phase 2: Wait for HTTP response (curl)
  if [ -n "$listen_time" ]; then
    for i in $(seq 1 $timeout); do
      if curl -s "http://localhost:$PORT" > /dev/null 2>&1; then
        ready_time=$(python3 -c 'import time; print(int(time.time() * 1000))')
        break
      fi
      sleep 0.05
    done
  fi

  # Kill the server
  kill $pid 2>/dev/null || true
  wait $pid 2>/dev/null || true

  if [ -n "$listen_time" ] && [ -n "$ready_time" ]; then
    local listen_delta=$((listen_time - start_time))
    local ready_delta=$((ready_time - start_time))
    echo "$listen_delta,$ready_delta"
  else
    echo "TIMEOUT,TIMEOUT"
  fi
}

run_benchmark_series() {
  local series_name=$1
  local clean_next=$2

  echo "--- $series_name ---"
  echo "Run | Listen | Ready | Delta"
  echo "----|--------|-------|------"

  local listen_times=""
  local ready_times=""
  local deltas=""

  for i in $(seq 1 $RUNS); do
    RESULT=$(benchmark_run "$series_name-$i" "$clean_next")
    LISTEN=$(echo "$RESULT" | cut -d',' -f1)
    READY=$(echo "$RESULT" | cut -d',' -f2)

    if [ "$LISTEN" != "TIMEOUT" ] && [ "$READY" != "TIMEOUT" ]; then
      DELTA=$((READY - LISTEN))
      printf "%3d | %5dms | %5dms | %5dms\n" "$i" "$LISTEN" "$READY" "$DELTA"
      listen_times="$listen_times $LISTEN"
      ready_times="$ready_times $READY"
      deltas="$deltas $DELTA"
    else
      printf "%3d | TIMEOUT | TIMEOUT | -\n" "$i"
    fi
  done

  # Calculate averages
  local listen_avg=$(echo $listen_times | tr ' ' '\n' | grep -v '^$' | awk '{sum+=$1; count++} END {if(count>0) printf "%.0f", sum/count; else print "N/A"}')
  local ready_avg=$(echo $ready_times | tr ' ' '\n' | grep -v '^$' | awk '{sum+=$1; count++} END {if(count>0) printf "%.0f", sum/count; else print "N/A"}')
  local delta_avg=$(echo $deltas | tr ' ' '\n' | grep -v '^$' | awk '{sum+=$1; count++} END {if(count>0) printf "%.0f", sum/count; else print "N/A"}')

  echo ""
  echo "Average: listen=${listen_avg}ms, ready=${ready_avg}ms, delta=${delta_avg}ms"
  echo ""

  # Export for summary
  export "${series_name}_LISTEN_AVG=$listen_avg"
  export "${series_name}_READY_AVG=$ready_avg"
  export "${series_name}_DELTA_AVG=$delta_avg"
}

# Run cold start benchmarks
run_benchmark_series "COLD" true

# Warmup for bytecode cache
echo "--- Warming up bytecode cache (12s) ---"
"$NEXT_BIN" dev --turbopack --port $PORT "$TEST_DIR" > /dev/null 2>&1 &
WARMUP_PID=$!
for i in $(seq 1 200); do
  if curl -s "http://localhost:$PORT" > /dev/null 2>&1; then
    break
  fi
  sleep 0.05
done
sleep 12
kill $WARMUP_PID 2>/dev/null || true
wait $WARMUP_PID 2>/dev/null || true
echo ""

# Run warm start benchmarks
run_benchmark_series "WARM" false

# Summary
echo "=============================================="
echo "                  SUMMARY"
echo "=============================================="
echo ""
echo "Cold Start ($RUNS runs):"
echo "  Port listening: ${COLD_LISTEN_AVG}ms"
echo "  First request:  ${COLD_READY_AVG}ms"
echo "  Deferred init:  ${COLD_DELTA_AVG}ms"
echo ""
echo "Warm Start ($RUNS runs):"
echo "  Port listening: ${WARM_LISTEN_AVG}ms"
echo "  First request:  ${WARM_READY_AVG}ms"
echo "  Deferred init:  ${WARM_DELTA_AVG}ms"
echo ""

if [ "$COLD_READY_AVG" != "N/A" ] && [ "$WARM_READY_AVG" != "N/A" ]; then
  CACHE_BENEFIT=$((COLD_READY_AVG - WARM_READY_AVG))
  echo "Cache benefit: ${CACHE_BENEFIT}ms (cold - warm ready)"
fi
