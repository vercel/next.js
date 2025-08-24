#!/usr/bin/env bash

set -eu

SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

WS_CRATES="$("$SCRIPT_DIR"/get-workspace-crates.sh)"
echo "$WS_CRATES" | jq -r -c '[.[] | select(.targets[] | .kind | contains(["bench"])) | .name] | sort | unique' | jq -r -c '[.[] | select(. != "napi" and . != "wasm")]'
