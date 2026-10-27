#!/bin/bash
set -uo pipefail

mkdir -p /logs/verifier
reward=0
server_pid=''

cleanup() {
  if [ -n "$server_pid" ]; then
    kill "$server_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if [ -s /tmp/agent.patch ] && \
  git -C /app apply --binary --whitespace=nowarn /tmp/agent.patch; then
  if node /tests/source-check.mjs && \
    runuser -u agent -- bash -lc \
      'cd /app && ./node_modules/.bin/next typegen' && \
    runuser -u agent -- bash -lc \
      'cd /app && ./node_modules/.bin/tsc --noEmit' && \
    runuser -u agent -- bash -lc \
      'cd /app && ./node_modules/.bin/next build'; then
    runuser -u agent -- bash -lc \
      'cd /app && PORT=3010 ./node_modules/.bin/next start' \
      > /tmp/next-start.log 2>&1 &
    server_pid=$!

    for _ in $(seq 1 60); do
      if node -e "fetch('http://127.0.0.1:3010/projects').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"; then
        break
      fi
      sleep 1
    done

    if kill -0 "$server_pid" 2>/dev/null && \
      /tests/node_modules/.bin/playwright test \
        --config=/tests/playwright.config.ts \
        --reporter=line; then
      reward=1
    fi
  fi
fi

printf '{"reward": %s}\n' "$reward" > /logs/verifier/reward.json
exit 0
