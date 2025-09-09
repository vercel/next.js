#!/usr/bin/env bash
set -euo pipefail

# Determine production flag from DEPLOY_ENVIRONMENT
PROD=""
if [ "${DEPLOY_ENVIRONMENT:-preview}" = "production" ]; then
  PROD="--prod"
fi

if [ -z "${VERCEL_API_TOKEN:-}" ]; then
  echo "VERCEL_API_TOKEN was not providing, skipping..." >&2
  exit 0
fi

CWD="apps/docs"
PROJECT="next-docs"

echo "Deploying docs from $CWD as project $PROJECT..." >&2

# Link the project (send output to stderr to keep stdout clean for URL capture)
vercel link --cwd "$CWD" --scope vercel --project "$PROJECT" --token "$VERCEL_API_TOKEN" --yes 1>&2

# Deploy and print only the resulting URL on stdout
URL=$(vercel deploy --cwd "$CWD" --token "$VERCEL_API_TOKEN" $PROD)
echo "$URL"


