#!/bin/bash

git describe --exact-match

if [[ ! $? -eq 0 ]];then
  echo "Nothing to publish, exiting.."
  touch .github/actions/next-stats-action/SKIP_NEXT_STATS.txt
  exit 0;
fi

if [[ -z "$NPM_TOKEN" ]];then
  echo "No NPM_TOKEN, exiting.."
  exit 0;
fi

echo "Publish occurred, running release stats..."
echo "Waiting 30 seconds to allow publish to finalize"
sleep 30
