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

mdbook build --dest-dir $(pwd)/target/mdbook ./packages/next-swc/docs

PACKAGES="-p next-swc-napi -p next-api -p next-build -p next-core -p next-custom-transforms"
RUSTDOCFLAGS="-Z unstable-options --enable-index-page" cargo doc $PACKAGES --no-deps --document-private-items

cp -r $(pwd)/target/doc $(pwd)/target/mdbook/rustdoc

if [ -z ${VERCEL_API_TOKEN+x} ]; then
  echo "VERCEL_API_TOKEN was not providing, skipping..."
  exit 0
fi


DOCS_OUTDIR="$(pwd)/target/mdbook"
PROJECT="turbopack-rust-docs"
echo "Deploying directory $DOCS_OUTDIR as $PROJECT to Vercel..."

vercel link --cwd $DOCS_OUTDIR --scope vercel --project $PROJECT --token "$VERCEL_API_TOKEN" --yes
vercel deploy --cwd $DOCS_OUTDIR --token "$VERCEL_API_TOKEN" $PROD