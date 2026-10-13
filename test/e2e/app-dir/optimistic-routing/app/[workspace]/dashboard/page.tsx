import Link from 'next/link'

export default async function WorkspaceDashboard({
  params,
}: {
  params: Promise<{ workspace: string }>
}) {
  const { workspace } = await params
  const items = [1, 2, 3, 4, 5, 6]

  return (
    <main>
      <h1 id="workspace-dashboard">Workspace dashboard for {workspace}</h1>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 16,
        }}
      >
        {items.map((itemId) => (
          <Link
            key={itemId}
            href={'/' + workspace + '/items/' + itemId + '/view'}
          >
            Item {itemId}
          </Link>
        ))}
      </div>
    </main>
  )
}
