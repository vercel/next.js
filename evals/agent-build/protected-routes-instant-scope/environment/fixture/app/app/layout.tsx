import Link from 'next/link'
import { WorkspaceNav } from '@/components/workspace-nav'
import { getSession } from '@/lib/session'

// The dev overlay recommended this when the layout started blocking.
export const instant = false

export default async function WorkspaceLayout({
  children,
}: LayoutProps<'/app'>) {
  const session = await getSession()

  if (!session) {
    return (
      <main>
        <h1>Sign in required</h1>
        <p>
          You need to sign in to use the workspace.{' '}
          <Link href="/login">Go to sign in</Link>
        </p>
      </main>
    )
  }

  return (
    <div data-layout="workspace">
      <WorkspaceNav teamName={session.teamName} />
      <main>{children}</main>
    </div>
  )
}
