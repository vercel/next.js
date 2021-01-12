#!/bin/bash

yarn --cwd packages/next/bundles
cp packages/next/bundles/node_modules/webpack5/lib/hmr/HotModuleReplacement.runtime.js packages/next/bundles/webpack/packages/
cp packages/next/bundles/node_modules/webpack5/lib/hmr/JavascriptHotModuleReplacement.runtime.js packages/next/bundles/webpack/packages/
yarn --cwd packages/next ncc-compiled

# Make sure to exit with 1 if there are changes after running ncc-compiled
# step to ensure we get any changes committed

if [[ ! -z $(git status -s) ]];then
  echo "Detected changes"
  git status
  exit 1
fi
