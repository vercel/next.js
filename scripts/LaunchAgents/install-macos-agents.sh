#!/usr/bin/env bash
#
# Optionally automates compressing target/ and other directories.
# Only intended for and needed on macOS.

set -e

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
NEXT_DIR=$(realpath "$SCRIPT_DIR/../..")

defaults write build.turbo.repopath -string "$NEXT_DIR"

for filename in "$SCRIPT_DIR"/*.plist; do
  PLIST_FILE="$HOME/Library/LaunchAgents/$(basename "$filename")"
  ln -sf "$filename" "$PLIST_FILE"
  launchctl unload "$PLIST_FILE" || true
  launchctl load "$PLIST_FILE"
done
