export const unstable_instant = { prefetch: 'static' }

export default async function Page({
  params,
}: {
  params: Promise<{ param: string }>
}) {
  return (
    <main>
      <p>Params need a suspense boundary when statically prefetched.</p>
      <Runtime params={params} />
    </main>
  )
}

async function Runtime({ params }: { params: Promise<{ param: string }> }) {
  const { param } = await params
  return <div id="runtime-content">Param value: {param}</div>
}
