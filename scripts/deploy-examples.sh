#!/usr/bin/env bash

CHANGED_EXAMPLES=$(node scripts/run-for-change.js --type deploy-examples --listChangedDirectories)

for CWD in $CHANGED_EXAMPLES ; do
  PROJECT=$(echo $CWD | | tr '/' '-')
  echo "Deploying directory $CWD as $PROJECT to Vercel..."
  vercel link --cwd $CWD --scope vercel --project "$PROJECT" --token "$VERCEL_API_TOKEN"
  vercel deploy --cwd $CWD --token "$VERCEL_API_TOKEN"
done;
