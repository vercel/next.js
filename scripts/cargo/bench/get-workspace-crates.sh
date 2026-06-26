#!/usr/bin/env bash

set -eu

cargo metadata --format-version 1 --no-deps | jq -r -j '[.packages[] | select(.source == null)]'