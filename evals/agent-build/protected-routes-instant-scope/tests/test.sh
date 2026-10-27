#!/bin/bash
# Verifier for nextjs/protected-routes-instant-scope.
#
# Applies the agent's patch to the baseline, runs the source checks, builds
# for production, starts the server, then checks the prerendered shells, the
# HTTP redirect for signed-out visitors, signed-in behavior and isolation,
# instant client navigation, and finally the server log for prerender errors
# that only appear at request time.
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
export EVAL_BASE_GIT=${EVAL_BASE_GIT:-/opt/eval/base.git}

mkdir -p "$LOGS"
reward=0
server_pid=''
server_log=$LOGS/next-start.log

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
  if node "$TESTS/check-source.mjs" &&
    rm -rf "$APP/.next" &&
    run_in_app 'npm run typecheck' &&
    run_in_app 'npm run build'; then
    run_in_app "PORT=$PORT npm run start" > "$server_log" 2>&1 &
    server_pid=$!

    for _ in $(seq 1 60); do
      if node -e "fetch('$EVAL_BASE_URL/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"; then
        break
      fi
      sleep 1
    done

    if kill -0 "$server_pid" 2>/dev/null &&
      "$TESTS/node_modules/.bin/playwright" test \
        --config="$TESTS/playwright.config.ts" \
        --reporter=line; then
      sleep 2
      if grep -q "while prerendering\|unstable value\|Could not validate" "$server_log"; then
        echo "The production server logged a prerender or validation error:" >&2
        grep -n "while prerendering\|unstable value\|Could not validate" "$server_log" >&2
      else
        reward=1
      fi
    fi
  fi
fi

printf '{"reward": %s}\n' "$reward" > "$LOGS/reward.json"
exit 0
