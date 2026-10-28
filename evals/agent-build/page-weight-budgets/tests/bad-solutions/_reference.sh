#!/bin/bash
# Shared helper: apply the reference repair, so each known-bad script changes
# exactly one decision on top of it.
set -euo pipefail
bash "${SOLUTION_DIR:-/solution}/solve.sh"
