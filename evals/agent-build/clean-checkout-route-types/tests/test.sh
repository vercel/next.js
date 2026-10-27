#!/bin/bash
# Verifier for nextjs/clean-checkout-route-types.
#
# Simulates the repository's CI on a clean clone: apply the agent's patch to
# the baseline, remove any generated output, then run the checked-in
# `typecheck` and `build` scripts exactly as the workflow does. The source
# checks reject hand-written framework types, loosened compiler settings, and
# committed generated files. The route checks prove every page, slot, docs
# route, and API route still works in the production server.
#
# Paths default to Harbor's layout. The EVAL_* variables let the same script
# run outside a container (see evals/agent-build/tools/run-local.sh).
set -uo pipefail

APP=${EVAL_APP_ROOT:-/app}
TESTS=${EVAL_TESTS_DIR:-/tests}
LOGS=${EVAL_LOGS_DIR:-/logs/verifier}
PATCH=${EVAL_PATCH:-/tmp/agent.patch}
PORT=${EVAL_PORT:-3010}
export EVAL_APP_ROOT=$APP EVAL_BASE_URL="http://127.0.0.1:$PORT"

mkdir -p "$LOGS"
reward=0
server_pid=''

cleanup() {
  if [ -n "$server_pid" ]; then
    kill "$server_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT

run_in_app() {
  if [ -n "${EVAL_LOCAL:-}" ]; then
    (cd "$APP" && NEXT_TELEMETRY_DISABLED=1 bash -c "$1")
  else
    runuser -u agent -- env NEXT_TELEMETRY_DISABLED=1 bash -lc "cd $APP && $1"
  fi
}

if [ ! -s "$PATCH" ] ||
  git -C "$APP" apply --binary --whitespace=nowarn "$PATCH"; then
  if node "$TESTS/check-patch.mjs" "$PATCH" &&
    node "$TESTS/check-source.mjs" &&
    rm -rf "$APP/.next" &&
    run_in_app 'npm run typecheck' &&
    run_in_app 'npm run build'; then
    run_in_app "PORT=$PORT npm run start" > "$LOGS/next-start.log" 2>&1 &
    server_pid=$!

    for _ in $(seq 1 60); do
      if node -e "fetch('$EVAL_BASE_URL/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"; then
        break
      fi
      sleep 1
    done

    if kill -0 "$server_pid" 2>/dev/null && node "$TESTS/check-routes.mjs"; then
      reward=1
    fi
  fi
fi

printf '{"reward": %s}\n' "$reward" > "$LOGS/reward.json"
exit 0
