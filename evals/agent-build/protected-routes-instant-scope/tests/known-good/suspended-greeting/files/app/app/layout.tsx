import { Suspense } from 'react'
import { WorkspaceNav } from '@/components/workspace-nav'
import { getCurrentSession } from '@/lib/session'

export default function WorkspaceLayout({ children }: LayoutProps<'/app'>) {
  return (
    <div data-layout="workspace">
      <Suspense fallback={<WorkspaceNav teamName="…" />}>
        <WorkspaceTeamNav />
      </Suspense>
      <main>{children}</main>
    </div>
  )
}

async function WorkspaceTeamNav() {
  const session = await getCurrentSession()
  return <WorkspaceNav teamName={session.teamName} />
}
