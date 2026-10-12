#!/usr/bin/env bash

dir="$(dirname "${BASH_SOURCE[0]}")"

path="${1-}";

if [ -z "$path" ]; then
  echo "Missing required pathname argument." >&2
  echo "Usage: ${BASH_SOURCE[0]} <page pathname>" >&2
  exit 1
fi


export CACHE_FILE="$dir/value.json";
INITIAL_CACHE_VALUE='{ "tag": "original", "timestamp": -1 }'
echo "$INITIAL_CACHE_VALUE" > "$CACHE_FILE"

rm -rf "$dir/.next";
pnpm next build "$dir" || exit 1;

export PORT=3000
pnpm next start "$dir" &
server_pid="$!"

function cleanup {
  trap - SIGTERM
  kill -- "$server_pid"
  echo "$INITIAL_CACHE_VALUE" > "$CACHE_FILE"
}

trap 'cleanup' SIGINT SIGTERM EXIT

sleep 1;

echo "Revalidating page: $path"
curl -X POST "http://localhost:$PORT/update-cached-value";

num_attempts=10
did_revalidate=0
for (( i=0; i < "$num_attempts"; i++ )); do
  content="$(curl -s "http://localhost:$PORT$path")" || break
  if [[ "$content" == *'Cached value: updated'* ]]; then
    did_revalidate=1
    echo "Revalidation finished"
    break;
  else
    echo "Revalidation not finished"
    echo '--------------'
    echo "$content"
    echo '--------------'
    sleep 0.5
  fi
done
if [ "$did_revalidate" == '0' ]; then
  echo "Revalidation not finished after $num_attempts attempts"
  kill -- -$$
  exit 1
fi

wait "$server_pid"
