#!/bin/bash
# Rejected by: behavior.spec.ts. Without the proxy, a signed-out request
# reaches the page, the shell streams with a 200, and the redirect arrives
# inside the stream. Uptime checks and non-browser clients never see a 3xx.
set -euo pipefail
SOLUTION_DIR=${SOLUTION_DIR:-/solution}
cp "$SOLUTION_DIR/files/lib/session.ts" lib/session.ts
cp "$SOLUTION_DIR/files/app/app/layout.tsx" app/app/layout.tsx
cp "$SOLUTION_DIR/files/app/app/page.tsx" app/app/page.tsx
cp "$SOLUTION_DIR/files/app/app/invoices/page.tsx" app/app/invoices/page.tsx
cp "$SOLUTION_DIR/files/app/app/settings/page.tsx" app/app/settings/page.tsx
