#!/usr/bin/env bash
set -euo pipefail

ITERATIONS=5

show_help() {
  echo "Usage: $(basename "$0") [-i|--iterations N] [-h|--help]"
  exit "${1:-0}"
}

if ! OPTS=$(getopt -o i:h --long iterations:,help -n "$(basename "$0")" -- "$@"); then
  show_help 1
fi
eval set -- "$OPTS"

while true; do
  case "$1" in
    -i|--iterations)
      ITERATIONS="$2"
      shift 2
      ;;
    -h|--help)
      show_help
      ;;
    *)
      break
      ;;
  esac
done

cleanup() {
  for i in $(seq 1 "$ITERATIONS"); do
    rm -rf "fixtures-$i"
  done
}

trap cleanup EXIT
cleanup

run_benchmark() {
  local name=$1
  local script=$2
  shift 2

  echo "-----------"
  for i in $(seq 1 "$ITERATIONS"); do
    local fixture="fixtures-$i"
    mkdir "$fixture"
    cd "fixtures-$i"
    fuzzponent -d 2 -s 20
    cd ..
    echo "$name $i"
    node "$script" "$fixture" "$@"
    if [[ -d "$fixture" ]]; then rmdir "$fixture"; fi
  done
}

run_benchmark "rimraf (async)" "rimraf.js" "async"
run_benchmark "rimraf (sync)" "rimraf.js" "sync"
run_benchmark "recursive delete" "recursive-delete.js"
run_benchmark "nodejs rm (promises)" "nodejs-rm.js" "promises"
run_benchmark "nodejs rm (callback)" "nodejs-rm.js" "callback"
run_benchmark "nodejs rm (sync)" "nodejs-rm.js" "sync"
