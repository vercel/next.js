#!/bin/bash

yarn --cwd packages/next ncc-compiled

# Make sure to exit with 1 if there are changes after running ncc-compiled
# step to ensure we get any changes committed

if [[ ! -z $(git status -s) ]];then
  echo "Detected changes"
  git status
  exit 1
fi
