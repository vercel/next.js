#!/usr/bin/env bash
set -eu -o pipefail

# Runs a deployment test in a loop until it fails, re-using the same
# deployment across test runs.
#
# Usage:
#   scripts/loop-deploy-test.sh pnpm test-deploy ...


cmd=( "$@" )
echo "Running test command in loop until failure:"
echo "  ${cmd[*]}"
echo ""

deploy_url=''
attempt=1
while true; do
  echo "=================================="
  echo "Starting Attempt $attempt"
  echo "=================================="
  if [ -z "$deploy_url" ]; then
    # First run: save the output so we can extract a deployment URL from the logs.
    # Set FORCE_COLOR=1, otherwise jest will detect it's being piped into something
    # and disable color output.
    # (NOTE: We need `-o pipefail` to see a failing status)
    tmp="$(mktemp)"
    if FORCE_COLOR=true "${cmd[@]}" | tee "$tmp"; then
      echo "=================================="
      echo "Attempt $attempt succeeded"
      echo "=================================="
      deploy_url="$(<"$tmp" sed -E -n 's|Deployment URL: (https://.*)|\1|p')"
      if [ -z "$deploy_url" ]; then
        echo "Failed to extract deployment URL from test logs ($tmp)"
        exit 1
      fi
    else
      # already failed
      echo "=================================="
      echo "Attempt $attempt failed"
      echo "=================================="
      exit 0
    fi
    
  else
    # N-th run -- re-use the deployment URL from the first one.
    if NEXT_TEST_DEPLOY_URL="$deploy_url" "${cmd[@]}"; then
      echo "=================================="
      echo "Attempt $attempt succeeded"
      echo "=================================="
    else
      echo "=================================="
      echo "Attempt $attempt failed"
      echo "=================================="
      exit 0
    fi
  fi
  attempt=$(( attempt + 1 ))
done
