import { Suspense } from 'react'

async function Heading({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <h1 id="heading">Page b {id}</h1>
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <Heading params={params} />
    </Suspense>
  )
}
