#!/bin/bash
#
# Benchmark dev server boot time (wall-clock)
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

benchmark_run() {
  local label=$1
  local clean_next=$2

  if [ "$clean_next" = "true" ]; then
    rm -rf "$TEST_DIR/.next"
  fi

  # Measure wall-clock time from command start to server accepting connections
  local start_time=$(python3 -c 'import time; print(int(time.time() * 1000))')

  "$NEXT_BIN" dev --turbopack --port $PORT "$TEST_DIR" > /dev/null 2>&1 &
  local pid=$!

  # Wait for server to accept connections (up to 30s)
  local timeout=600  # 30s at 50ms intervals
  local ready=false
  for i in $(seq 1 $timeout); do
    if curl -s "http://localhost:$PORT" > /dev/null 2>&1; then
      ready=true
      break
    fi
    sleep 0.05
  done

  local end_time=$(python3 -c 'import time; print(int(time.time() * 1000))')

  # Kill the server
  kill $pid 2>/dev/null || true
  wait $pid 2>/dev/null || true

  if [ "$ready" = "true" ]; then
    local duration=$((end_time - start_time))
    echo "$duration"
  else
    echo "TIMEOUT"
  fi
}

echo "--- Cold Start (fresh .next) ---"
COLD_TIMES=""
for i in $(seq 1 $RUNS); do
  TIME=$(benchmark_run "cold-$i" true)
  if [ "$TIME" != "TIMEOUT" ]; then
    COLD_TIMES="$COLD_TIMES $TIME"
    echo "Run $i: ${TIME}ms"
  else
    echo "Run $i: TIMEOUT"
  fi
done

COLD_AVG=$(echo $COLD_TIMES | tr ' ' '\n' | grep -v '^$' | awk '{sum+=$1; count++} END {if(count>0) printf "%.0f", sum/count; else print "N/A"}')
echo ""
echo "Cold start average: ${COLD_AVG}ms"
echo ""

echo "--- Warm Start (with .next cache) ---"
# First run to create cache, let it warm up
echo "Creating bytecode cache (12s warmup)..."
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

WARM_TIMES=""
for i in $(seq 1 $RUNS); do
  TIME=$(benchmark_run "warm-$i" false)
  if [ "$TIME" != "TIMEOUT" ]; then
    WARM_TIMES="$WARM_TIMES $TIME"
    echo "Run $i: ${TIME}ms"
  else
    echo "Run $i: TIMEOUT"
  fi
done

WARM_AVG=$(echo $WARM_TIMES | tr ' ' '\n' | grep -v '^$' | awk '{sum+=$1; count++} END {if(count>0) printf "%.0f", sum/count; else print "N/A"}')
echo ""
echo "Warm start average: ${WARM_AVG}ms"
echo ""

echo "=== Summary ==="
echo "Cold start: ${COLD_AVG}ms (avg of $RUNS runs)"
echo "Warm start: ${WARM_AVG}ms (avg of $RUNS runs)"

if [ "$COLD_AVG" != "N/A" ] && [ "$WARM_AVG" != "N/A" ]; then
  DIFF=$((COLD_AVG - WARM_AVG))
  echo "Difference: ${DIFF}ms (cold - warm)"
fi
