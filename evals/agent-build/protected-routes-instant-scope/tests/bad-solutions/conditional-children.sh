#!/bin/bash
# Rejected by: behavior.spec.ts. Deciding inside the layout whether to render
# {children} drops every page segment from the prerender, so the shells have
# the frame but no page heading, and the dev server reports dropped segments.
set -euo pipefail
SOLUTION_DIR=${SOLUTION_DIR:-/solution}
cp "$SOLUTION_DIR/files/proxy.ts" proxy.ts
cp "$SOLUTION_DIR/files/lib/session.ts" lib/session.ts
cp "$SOLUTION_DIR/files/app/app/page.tsx" app/app/page.tsx
cp "$SOLUTION_DIR/files/app/app/invoices/page.tsx" app/app/invoices/page.tsx
cp "$SOLUTION_DIR/files/app/app/settings/page.tsx" app/app/settings/page.tsx
cat > app/app/layout.tsx <<'EOF'
import Link from 'next/link'
import { Suspense } from 'react'
import { WorkspaceNav } from '@/components/workspace-nav'
import { getSession } from '@/lib/session'

export default function WorkspaceLayout({ children }: LayoutProps<'/app'>) {
  return (
    <div data-layout="workspace">
      <Suspense fallback={<WorkspaceNav teamName="…" />}>
        <Gate>{children}</Gate>
      </Suspense>
    </div>
  )
}

async function Gate({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) {
    return (
      <main>
        <h1>Sign in required</h1>
        <Link href="/login">Go to sign in</Link>
      </main>
    )
  }
  return (
    <>
      <WorkspaceNav teamName={session.teamName} />
      <main>{children}</main>
    </>
  )
}
EOF
