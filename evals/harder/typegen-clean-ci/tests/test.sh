#!/bin/bash
set -uo pipefail

mkdir -p /logs/verifier /tmp/reference-app
reward=0

cp -R \
  /app/app \
  /app/next-env.d.ts \
  /app/next.config.ts \
  /app/package.json \
  /app/tsconfig.json \
  /tmp/reference-app/
ln -s /app/node_modules /tmp/reference-app/node_modules
(
  cd /tmp/reference-app
  ./node_modules/.bin/next typegen
)
cp /tmp/reference-app/.next/types/routes.d.ts /root/expected-routes.d.ts
chmod 600 /root/expected-routes.d.ts
rm -rf /tmp/reference-app

if [ -s /tmp/agent.patch ] && \
  git -C /app apply --binary --whitespace=nowarn /tmp/agent.patch; then
  cp /app/app/page.tsx /root/original-page.tsx
  printf '\nconst __verifierMustFail: string = 1\n' >> /app/app/page.tsx

  if ! runuser -u agent -- bash -lc \
    'cd /app && rm -rf .next && npm run typecheck' \
    > /tmp/sentinel-typecheck.log 2>&1; then
    cat /root/original-page.tsx > /app/app/page.tsx

    if runuser -u agent -- bash -lc \
      'cd /app && rm -rf .next && npm run typecheck' && \
      test -s /app/.next/types/routes.d.ts && \
      cmp -s /root/expected-routes.d.ts /app/.next/types/routes.d.ts && \
      node /tests/source-check.mjs && \
      /app/node_modules/.bin/tsc --project /tests/tsconfig.json && \
      ! git -C /app diff --name-only HEAD | grep -Eq '(^|/)\.next/'; then
      reward=1
    fi
  fi
fi

printf '{"reward": %s}\n' "$reward" > /logs/verifier/reward.json
exit 0
