#!/bin/bash
# Run an Agent Build task's own verifier locally, without Docker or Harbor.
#
#   evals/agent-build/tools/run-local.sh <task-dir> [solution-script] [port]
#
# The runner knows nothing about the framework under test. It recreates the
# layout Harbor gives a separate verifier, then executes the task's
# tests/test.sh with these variables pointing at the local copies:
#
#   EVAL_APP_ROOT   the fixture copy (Harbor: /app)
#   EVAL_TESTS_DIR  the tests copy, with verifier dependencies (Harbor: /tests)
#   EVAL_LOGS_DIR   where reward.json and logs go (Harbor: /logs/verifier)
#   EVAL_PATCH      the collected patch (Harbor: /tmp/agent.patch)
#   EVAL_BASE_GIT   the bare baseline repository (Harbor: /opt/eval/base.git)
#   EVAL_PORT       the port the verifier may use
#   EVAL_LOCAL      set, so the verifier runs commands directly, not as `agent`
#
# With no solution script it grades the untouched fixture, which must score 0.
# With solution/solve.sh it must score 1. With a script from
# tests/bad-solutions it must score 0 at the check that script's header names.
#
# Dependencies: Node and npm for JavaScript fixtures (installed from the
# committed lockfiles into the scratch directory and reused). Other
# ecosystems can set EVAL_INSTALL to the command that installs their fixture.
set -uo pipefail

TASK=$(cd "$1" && pwd)
SOLUTION=${2:-}
if [ -n "$SOLUTION" ]; then
  SOLUTION=$(cd "$(dirname "$SOLUTION")" && pwd)/$(basename "$SOLUTION")
fi
PORT=${3:-3010}
NAME=$(basename "$TASK")
SCRATCH=${AGENT_BUILD_SCRATCH:-/tmp/agent-build-local}
RUN=$SCRATCH/$NAME-$PORT

rm -rf "$RUN" && mkdir -p "$RUN/logs"
cp -R "$TASK/environment/fixture" "$RUN/app"
mkdir -p "$RUN/tests" && cp -R "$TASK/tests/." "$RUN/tests/"
rm -rf "$RUN/tests/fixture"

install_cached() {
  # install_cached <dir-with-manifest> <cache-key-file> <command>
  local dir=$1 key=$2 command=$3
  local hash cache
  hash=$(shasum "$dir/$key" | cut -c1-12)
  cache=$SCRATCH/deps-$hash
  if [ ! -d "$cache/node_modules" ]; then
    mkdir -p "$cache" && cp "$dir"/package*.json "$cache/"
    (cd "$cache" && bash -c "$command") || exit 1
  fi
  cp -R "$cache/node_modules" "$dir/node_modules"
}

if [ -f "$RUN/app/package-lock.json" ]; then
  install_cached "$RUN/app" package-lock.json "${EVAL_INSTALL:-npm ci --no-audit --no-fund}"
fi
if [ -f "$RUN/tests/package-lock.json" ]; then
  install_cached "$RUN/tests" package-lock.json \
    "npm ci --no-audit --no-fund && (grep -q playwright package.json && npx playwright install chromium || true)"
fi

cd "$RUN/app"
git init -q && git config user.email evals@vercel.com && git config user.name "Evals"
git add -A && git commit -qm baseline
git clone -q --bare . "$RUN/base.git"

if [ -n "$SOLUTION" ]; then
  echo "== applying $(basename "$SOLUTION")"
  # Solution scripts use GNU sed -i; provide it on macOS too.
  mkdir -p "$RUN/bin"
  if sed --version >/dev/null 2>&1; then
    ln -sf "$(command -v sed)" "$RUN/bin/sed"
  else
    printf '#!/bin/bash\nif [ "$1" = "-i" ]; then shift; exec /usr/bin/sed -i "" "$@"; fi\nexec /usr/bin/sed "$@"\n' > "$RUN/bin/sed"
    chmod +x "$RUN/bin/sed"
  fi
  if ! SOLUTION_DIR="$TASK/solution" PATH="$RUN/bin:$PATH" bash "$SOLUTION" > "$RUN/logs/solve.log" 2>&1; then
    echo "   solution script exited non-zero (expected for some bad repairs)"
    tail -3 "$RUN/logs/solve.log" | sed 's/^/   /'
  fi
fi

git --git-dir="$RUN/base.git" --work-tree="$RUN/app" add -A
git --git-dir="$RUN/base.git" --work-tree="$RUN/app" diff --cached --binary HEAD > "$RUN/agent.patch"
echo "== patch touches $(grep -c '^diff --git' "$RUN/agent.patch") files"

# A fresh copy of the fixture stands in for the verifier's own baseline image.
rm -rf "$RUN/verifier" && cp -R "$TASK/environment/fixture" "$RUN/verifier"
cp -R "$RUN/app/node_modules" "$RUN/verifier/node_modules" 2>/dev/null || true
(cd "$RUN/verifier" && git init -q && git add -A && git -c user.email=evals@vercel.com -c user.name=Evals commit -qm baseline)

lsof -ti :"$PORT" | xargs kill -9 2>/dev/null
EVAL_LOCAL=1 \
EVAL_APP_ROOT="$RUN/verifier" \
EVAL_TESTS_DIR="$RUN/tests" \
EVAL_LOGS_DIR="$RUN/logs" \
EVAL_PATCH="$RUN/agent.patch" \
EVAL_BASE_GIT="$RUN/base.git" \
EVAL_PORT="$PORT" \
bash "$RUN/tests/test.sh" > "$RUN/logs/test.log" 2>&1
lsof -ti :"$PORT" | xargs kill -9 2>/dev/null

reward=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$RUN/logs/reward.json','utf8')).reward)" 2>/dev/null || echo "missing")
if [ "$reward" != "1" ]; then
  grep -m2 -E "Error:|error TS|✘|REJECT" "$RUN/logs/test.log" | sed 's/^/   /'
fi
echo "reward=$reward"
echo "   logs: $RUN/logs"
