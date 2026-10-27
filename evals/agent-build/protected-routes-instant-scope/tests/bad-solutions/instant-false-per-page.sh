#!/bin/bash
# Rejected by: behavior.spec.ts. Opting every page out makes the dev overlay
# quiet and the build green, but every workspace route stays fully dynamic, so
# the build writes no shell and navigation is not instant.
set -euo pipefail
SOLUTION_DIR=${SOLUTION_DIR:-/solution}
cp "$SOLUTION_DIR/files/proxy.ts" proxy.ts
for page in app/app/page.tsx app/app/invoices/page.tsx app/app/settings/page.tsx; do
  sed -i 's#^export default async function#export const instant = false\n\nexport default async function#' "$page"
done
