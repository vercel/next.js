#!/usr/bin/env bash
set -euo pipefail


PROD=""

if [ -z ${DEPLOY_ENVIRONMENT+x} ]; then
    DEPLOY_ENVIRONMENT=""
else
    if [ "$DEPLOY_ENVIRONMENT" = "production" ]; then
      PROD="--prod"
    fi
fi

RUSTDOCFLAGS="-Z unstable-options --index-page $(pwd)/packages/next-swc/docs/index.md" cargo doc -p turbo-tasks-fs --no-deps

if [ -z ${VERCEL_API_TOKEN+x} ]; then
  echo "VERCEL_API_TOKEN was not providing, skipping..."
  exit 0
fi


DOCS_OUTDIR="$(pwd)/target/doc"
PROJECT="turbopack-rust-docs"
echo "Deploying directory $DOCS_OUTDIR as $PROJECT to Vercel..."

vercel link --cwd $DOCS_OUTDIR --scope vercel --project $PROJECT --token "$VERCEL_API_TOKEN" --yes
vercel deploy --cwd $DOCS_OUTDIR --token "$VERCEL_API_TOKEN" $PROD