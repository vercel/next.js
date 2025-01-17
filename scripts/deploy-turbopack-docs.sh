#!/usr/bin/env bash
set -euo pipefail

PACKAGES="-p next-swc-napi -p next-api -p next-build -p next-core -p next-custom-transforms"
RUSTDOCFLAGS="-Z unstable-options --enable-index-page" cargo doc $PACKAGES --no-deps