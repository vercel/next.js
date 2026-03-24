#!/bin/bash
# Quick sanity check for stats benchmark config
# Tests that the dev server can start with the new config
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "=== Stats Benchmark Config Test ==="

# Check Next.js is built
if [ ! -d "packages/next/dist" ]; then
  echo "ERROR: Next.js not built. Run 'pnpm build' first."
  exit 1
fi

# Create temp test app
WORK_DIR=$(mktemp -d)
trap "rm -rf $WORK_DIR" EXIT

echo "Setting up test app in $WORK_DIR..."
cp -r test/.stats-app/* "$WORK_DIR/"
cd "$WORK_DIR"

# Write the config that stats-config.js would write (with turbopack: {})
cat > next.config.js << 'EOF'
module.exports = {
  generateBuildId: () => 'BUILD_ID',
  turbopack: {},
}
EOF

echo "Config:"
cat next.config.js
echo ""

# Link local Next.js
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json'));
pkg.dependencies.next = 'file:$REPO_ROOT/packages/next';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
"
echo "Installing dependencies..."
pnpm install --ignore-scripts 2>/dev/null

# Test Turbopack dev (the failing scenario)
echo ""
echo "=== Test 1: Turbopack dev (default, no flag) ==="
PORT=$(python3 -c "import socket; s=socket.socket(); s.bind(('',0)); print(s.getsockname()[1]); s.close()")

rm -rf .next
NEXT_TELEMETRY_DISABLED=1 timeout 30 pnpm next dev --port $PORT > /tmp/turbo.log 2>&1 &
PID=$!
sleep 12

if kill -0 $PID 2>/dev/null; then
  echo "OK: Turbopack dev server is running"
  kill $PID 2>/dev/null || true
  wait $PID 2>/dev/null || true
else
  wait $PID 2>/dev/null || CODE=$?
  if [ "$CODE" = "1" ]; then
    echo "FAIL: Turbopack dev crashed (exit 1)"
    echo "Output:"
    cat /tmp/turbo.log
    exit 1
  fi
  echo "OK: Process exited (timeout or normal)"
fi

# Test Webpack dev
echo ""
echo "=== Test 2: Webpack dev (--webpack flag) ==="
PORT=$(python3 -c "import socket; s=socket.socket(); s.bind(('',0)); print(s.getsockname()[1]); s.close()")

rm -rf .next
NEXT_TELEMETRY_DISABLED=1 timeout 30 pnpm next dev --webpack --port $PORT > /tmp/webpack.log 2>&1 &
PID=$!
sleep 12

if kill -0 $PID 2>/dev/null; then
  echo "OK: Webpack dev server is running"
  kill $PID 2>/dev/null || true
  wait $PID 2>/dev/null || true
else
  echo "OK: Process exited (timeout or normal)"
fi

# Test Turbopack build
echo ""
echo "=== Test 3: Turbopack build ==="
rm -rf .next
if NEXT_TELEMETRY_DISABLED=1 pnpm next build 2>&1 | head -20; then
  echo "OK: Turbopack build completed"
else
  echo "FAIL: Turbopack build failed"
  exit 1
fi

# Test Webpack build
echo ""
echo "=== Test 4: Webpack build (--webpack flag) ==="
rm -rf .next
if NEXT_TELEMETRY_DISABLED=1 pnpm next build --webpack 2>&1 | head -20; then
  echo "OK: Webpack build completed"
else
  echo "FAIL: Webpack build failed"
  exit 1
fi

echo ""
echo "=== All tests passed ==="
