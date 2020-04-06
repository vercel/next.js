#!/bin/bash

yarn --cwd packages/next ncc-compiled

changes=$(git status -s)

# Make sure to exit with 1 if there are changes after running pre-ncc
# step to ensure we get any changes committed

if [[ ! -z $changes ]];then
  echo "Detected changes"
  echo $changes
  exit 1
fi
