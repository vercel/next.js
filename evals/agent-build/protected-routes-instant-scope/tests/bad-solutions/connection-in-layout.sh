#!/bin/bash
# Rejected by: next build. Following the [dynamic] suggestion at the top of
# the layout makes the whole subtree request-time and outside any Suspense
# boundary, so the build reports a blocking route for every workspace page.
set -euo pipefail
SOLUTION_DIR=${SOLUTION_DIR:-/solution}
cp "$SOLUTION_DIR/files/proxy.ts" proxy.ts
cp "$SOLUTION_DIR/files/lib/session.ts" lib/session.ts
cat > app/app/layout.tsx <<'EOF'
import { connection } from 'next/server'
import { WorkspaceNav } from '@/components/workspace-nav'
import { requireSession } from '@/lib/session'

export default async function WorkspaceLayout({
  children,
}: LayoutProps<'/app'>) {
  await connection()
  const session = await requireSession()

  return (
    <div data-layout="workspace">
      <WorkspaceNav teamName={session.teamName} />
      <main>{children}</main>
    </div>
  )
}
EOF
