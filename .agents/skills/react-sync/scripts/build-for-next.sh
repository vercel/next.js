#!/usr/bin/env bash
set -euo pipefail
set -x

bundles=(
  "react/index"
  "react/jsx"
  "react-jsx-runtime.react-server"
  "react-jsx-dev-runtime.react-server"
  "react/compiler-runtime"
  "react.react-server"
  "react-dom/index"
  "react-dom/client"
  "react-dom/profiling"
  "react-dom/server"
  "react-dom.react-server"
  "react-dom-server.browser"
  "react-dom-server.bun"
  "react-dom-server.edge"
  "react-dom-server.node"
  "react-dom-server-legacy.browser"
  "react-dom-server-legacy.node"
  "react-is"
  "scheduler"
  "react-server-dom-webpack/"
  "react-server-dom-turbopack/"
)

type="BUN_DEV,BUN_PROD,NODE_DEV,NODE_PROD,NODE_PROFILING,ESM_DEV,ESM_PROD,NODE_ES2015"

RELEASE_CHANNEL=stable node ./scripts/rollup/build.js "${bundles[@]}" --type="$type"
mv ./build/node_modules ./build/oss-stable

RELEASE_CHANNEL=experimental node ./scripts/rollup/build.js "${bundles[@]}" --type="$type" --unsafe-partial
mv ./build/node_modules ./build/oss-experimental
