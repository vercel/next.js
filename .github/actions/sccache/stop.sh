#!/usr/bin/env bash

echo "=== sccache stats ==="
sccache --show-stats || true
sccache --stop-server 2>/dev/null || true

# Show server error log if present
LOG="${RUNNER_TEMP:-/tmp}/sccache-error.log"
if [ -f "$LOG" ]; then
  echo "=== sccache error log (last 30 lines) ==="
  tail -30 "$LOG"
fi
