import { ReactNode } from 'react'

type WorkspaceLayoutProps = {
  activity: ReactNode
  children: ReactNode
  params: Promise<{
    workspace: string
  }>
  sidebar: ReactNode
}

export default async function WorkspaceLayout({
  activity,
  children,
  params,
  sidebar,
}: WorkspaceLayoutProps) {
  const { workspace } = await params

  return (
    <section id="workspace-shell-layout">
      <p id="workspace-shell-layout-name">workspace layout: {workspace}</p>
      <nav id="workspace-shell-sidebar">{sidebar}</nav>
      <aside id="workspace-shell-activity">{activity}</aside>
      <main id="workspace-shell-content">{children}</main>
    </section>
  )
}

export function generateStaticParams() {
  return [{ workspace: 'acme' }]
}
