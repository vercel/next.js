import { Suspense } from 'react'
import { WorkspaceNav } from '@/components/workspace-nav'
import { requireSession } from '@/lib/session'

// The frame renders for every request and is prerendered into the static
// shell. Only the team name depends on the session, so only it suspends.
// Children render unconditionally; the proxy already turned away requests
// without a session cookie.
export default function WorkspaceLayout({ children }: LayoutProps<'/app'>) {
  return (
    <div data-layout="workspace">
      <Suspense fallback={<WorkspaceNav teamName="…" />}>
        <TeamNav />
      </Suspense>
      <main>{children}</main>
    </div>
  )
}

async function TeamNav() {
  const session = await requireSession()
  return <WorkspaceNav teamName={session.teamName} />
}
