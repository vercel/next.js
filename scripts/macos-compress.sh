#!/usr/bin/env bash
#
# Optionally automates compressing target/ and other directories.
# Only intended for and needed on macOS.
#

set -e

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
NEXT_DIR=$(realpath "$SCRIPT_DIR/..")

# Basic timestamp prefix for logging
PS4='+ $(date "+%Y-%m-%d +%H:%M:%S") '

set -x

if ! command -v afsctool &> /dev/null; then
  echo "afsctool is required. Install it with 'brew install afsctool'."
  exit 1
fi

afsctool -c "$NEXT_DIR/target" "$NEXT_DIR/node_modules"
