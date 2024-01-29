#!/usr/bin/env bash

set -e

cd packages/next

cp node_modules/webpack/lib/hmr/HotModuleReplacement.runtime.js src/bundles/webpack/packages/
cp node_modules/webpack/lib/hmr/JavascriptHotModuleReplacement.runtime.js src/bundles/webpack/packages/
cp node_modules/webpack/hot/lazy-compilation-node.js src/bundles/webpack/packages/
cp node_modules/webpack/hot/lazy-compilation-web.js src/bundles/webpack/packages/

pnpm run ncc-compiled

cd ../../

# Make sure to exit with 1 if there are changes after running ncc-compiled
# step to ensure we get any changes committed

if [[ ! -z $(git status -s) ]] && [[ -z $IS_PUBLISH ]];then
  echo "Detected changes"
  git diff -a --stat
  exit 1
fi
