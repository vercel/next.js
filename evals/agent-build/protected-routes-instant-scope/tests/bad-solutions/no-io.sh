#!/bin/bash
# Rejected by: the server log check in test.sh. The build is green and every
# behavior check passes, but signed-in requests log the vendored SDK's
# Date.now() read during the prerender because nothing suspends before it.
set -euo pipefail
SOLUTION_DIR=${SOLUTION_DIR:-/solution}
cp "$SOLUTION_DIR/files/proxy.ts" proxy.ts
cp "$SOLUTION_DIR/files/app/app/layout.tsx" app/app/layout.tsx
cp "$SOLUTION_DIR/files/app/app/page.tsx" app/app/page.tsx
cp "$SOLUTION_DIR/files/app/app/invoices/page.tsx" app/app/invoices/page.tsx
cp "$SOLUTION_DIR/files/app/app/settings/page.tsx" app/app/settings/page.tsx
cat > lib/session.ts <<'EOF'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifySession, type Session } from '@/lib/vendor/session-sdk'

export const SESSION_COOKIE = 'ledger_session'

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  return verifySession(token)
}

export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) redirect('/login')
  return session
}
EOF
