#!/bin/bash
# Verifier for nextjs/prerender-unstable-values.
#
# Applies the agent's patch to the baseline, runs the source checks, builds
# for production, starts the server, exercises every route in a browser, and
# finally reads the server log. The log step matters: one of the four
# unstable-value sites only reports at request time, after the build is green.
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
  # `npm run start` wraps a next-server child; stop the wrapper, its children,
  # and whatever still listens on the port this verifier owns.
  if [ -n "$server_pid" ]; then
    pkill -P "$server_pid" 2>/dev/null || true
    kill "$server_pid" 2>/dev/null || true
  fi
  lsof -ti :"$PORT" 2>/dev/null | xargs kill 2>/dev/null || true
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
      if grep -q "while prerendering\|unstable value" "$server_log"; then
        echo "The production server logged a prerender error:" >&2
        grep -n "while prerendering\|unstable value" "$server_log" >&2
      else
        reward=1
      fi
    fi
  fi
fi

printf '{"reward": %s}\n' "$reward" > "$LOGS/reward.json"
exit 0
