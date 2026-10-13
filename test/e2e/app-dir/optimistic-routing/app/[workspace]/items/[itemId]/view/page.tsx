export default async function ItemPage({
  params,
}: {
  params: Promise<{ workspace: string; itemId: string }>
}) {
  const { workspace, itemId } = await params

  return (
    <main>
      <h1 id="item-view">Item {itemId} for {workspace}</h1>
    </main>
  )
}
