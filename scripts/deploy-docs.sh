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

CWD="."
PROJECT="next-docs"

echo "Deploying docs (project rootDirectory is configured in Vercel) as project $PROJECT..." >&2

# Link the project from repo root (send output to stderr to keep stdout clean for URL capture)
vercel link --scope vercel --project "$PROJECT" --token "$VERCEL_API_TOKEN" --yes 1>&2

# Deploy from repo root; Vercel project rootDirectory (apps/docs) will be applied
URL=$(vercel deploy --token "$VERCEL_API_TOKEN" $PROD)
echo "$URL"


