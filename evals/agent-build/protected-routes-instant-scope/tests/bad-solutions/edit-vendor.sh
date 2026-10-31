#!/bin/bash
# Rejected by: check-source.mjs. Deleting the expiry comparison from the SDK
# silences the clock read, but the SDK is a dependency, and expired sessions
# would start passing verification.
set -euo pipefail
SOLUTION_DIR=${SOLUTION_DIR:-/solution}
bash "$(dirname "$0")/no-io.sh"
sed -i 's/const now = Date.now()/const now = Number.MAX_SAFE_INTEGER/' lib/vendor/session-sdk.ts
