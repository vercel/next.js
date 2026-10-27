#!/bin/bash
# Rejected by: check-source.mjs. Removing the clock read from the vendored SDK
# makes the log clean, but the SDK is a dependency and the next upgrade would
# bring the read back.
set -euo pipefail
bash "$(dirname "$0")/_three-sites.sh"
sed -i 's#const startedAt = Date.now()#const startedAt = 0#; s#durationMs: Date.now() - startedAt#durationMs: 0#' lib/vendor/customer-sdk.ts
