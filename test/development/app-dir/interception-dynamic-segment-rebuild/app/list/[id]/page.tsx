import { Suspense } from 'react'

async function Item({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <p id="full-page">Full page item: {id}</p>
}

export default function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return (
    <Suspense fallback={<p>Loading item...</p>}>
      <Item params={params} />
    </Suspense>
  )
}
