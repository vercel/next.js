#!/usr/bin/env bash

if [[ $(node ./scripts/check-is-release.js 2> /dev/null || :) = v* ]];
  then
    echo "Publish occurred, running release stats..."
  else
    echo "Not publish commit, exiting..."
    touch .github/actions/next-stats-action/SKIP_NEXT_STATS.txt
    exit 0;
fi

if [[ -z "$NPM_TOKEN" ]];then
  echo "No NPM_TOKEN, exiting.."
  exit 0;
fi

echo "Waiting 30 seconds to allow publish to finalize"
sleep 30
