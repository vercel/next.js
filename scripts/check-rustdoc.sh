#!/usr/bin/env bash
set -euo pipefail

# Build rustdoc for every crate in the Cargo workspace, including private items, and fail on any
# rustdoc warning (broken intra-doc links, bare URLs, unclosed HTML tags, ...).
RUSTDOCFLAGS="-D warnings" cargo doc --workspace --no-deps --document-private-items
