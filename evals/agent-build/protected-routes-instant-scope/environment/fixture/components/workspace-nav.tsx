import Link from 'next/link'

export function WorkspaceNav({ teamName }: { teamName: string }) {
  return (
    <aside data-testid="workspace-nav">
      <p data-testid="team-name">{teamName}</p>
      <nav aria-label="Workspace">
        <Link href="/app">Overview</Link>
        {' · '}
        <Link href="/app/invoices">Invoices</Link>
        {' · '}
        <Link href="/app/settings">Settings</Link>
      </nav>
    </aside>
  )
}
