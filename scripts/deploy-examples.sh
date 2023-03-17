#!/usr/bin/env bash
set -euo pipefail

CHANGED_EXAMPLES=$(node scripts/run-for-change.js --type deploy-examples --listChangedDirectories)
PROD=""
if [ "$DEPLOY_ENVIRONMENT" = "production" ]; then
  PROD="--prod"
fi

for CWD in $CHANGED_EXAMPLES ; do
  HYPHENS=$(echo "$CWD" | tr '/' '-')
  PROJECT="nextjs-$HYPHENS"
  echo "Deploying directory $CWD as $PROJECT to Vercel..."
  vercel link --cwd "$CWD" --scope vercel --project "$PROJECT" --token "$VERCEL_API_TOKEN" --yes
  vercel deploy --cwd "$CWD" --token "$VERCEL_API_TOKEN" $PROD
done;
