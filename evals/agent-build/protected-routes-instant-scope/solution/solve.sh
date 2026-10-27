#!/bin/bash
# Reference repair for nextjs/protected-routes-instant-scope.
#
# 1. Turn signed-out requests away in proxy.ts with a real HTTP redirect,
#    before any HTML streams.
# 2. Remove the layout opt-out. Render the workspace frame and {children}
#    unconditionally so every segment is in the static shell; only the
#    session-dependent pieces suspend.
# 3. Read searchParams and the session inside Suspense boundaries.
# 4. Keep the vendored SDK's clock read out of the prerender with io().
#
# The repaired files live next to this script in files/, which Harbor copies to
# /solution. SOLUTION_DIR overrides that location for local runs.
set -euo pipefail

SOLUTION_DIR=${SOLUTION_DIR:-/solution}

cp "$SOLUTION_DIR/files/proxy.ts" proxy.ts
cp "$SOLUTION_DIR/files/lib/session.ts" lib/session.ts
cp "$SOLUTION_DIR/files/app/app/layout.tsx" app/app/layout.tsx
cp "$SOLUTION_DIR/files/app/app/page.tsx" app/app/page.tsx
cp "$SOLUTION_DIR/files/app/app/invoices/page.tsx" app/app/invoices/page.tsx
cp "$SOLUTION_DIR/files/app/app/settings/page.tsx" app/app/settings/page.tsx

npm run typecheck
