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

echo "Preparing local build for docs (project: $PROJECT)..." >&2

# Ensure corepack and install only the docs workspace graph
if ! command -v corepack >/dev/null 2>&1; then
  echo "Installing corepack..." >&2
  npm i -g corepack@0.31 1>&2
fi
corepack enable 1>&2

echo "Installing dependencies for ./apps/docs..." >&2
# Reduce CI side-effects from deps we don't need for docs build
export NEXT_SKIP_NATIVE_POSTINSTALL=1
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

echo "Installing Vercel CLI..." >&2
npm i -g vercel@latest 1>&2

echo "Linking Vercel project..." >&2
vercel link --cwd "$CWD" --scope vercel --project "$PROJECT" --token "$VERCEL_API_TOKEN" --yes 1>&2

echo "Pulling env for $DEPLOY_ENVIRONMENT..." >&2
vercel pull --cwd "$CWD" --yes --environment="${DEPLOY_ENVIRONMENT:-preview}" --token="$VERCEL_API_TOKEN" 1>&2

echo "Building locally with Vercel..." >&2
vercel build --cwd "$CWD" --token="$VERCEL_API_TOKEN" 1>&2

echo "Deploying prebuilt output..." >&2
URL=$(vercel deploy --cwd "$CWD" --prebuilt --archive=tgz --token "$VERCEL_API_TOKEN" $PROD)
echo "$URL"


