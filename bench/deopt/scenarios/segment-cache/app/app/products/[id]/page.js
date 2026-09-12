import { Suspense } from 'react'

async function DynamicContent({ params }) {
  const { id } = await params
  return (
    <>
      <h1>product {id}</h1>
      <p>Dynamic page: params make this a runtime hole in the static shell.</p>
    </>
  )
}

export default function ProductPage({ params }) {
  return (
    <main>
      <Suspense fallback={<p>loading product…</p>}>
        <DynamicContent params={params} />
      </Suspense>
    </main>
  )
}
