import { Suspense } from 'react'

// The hole reads a search param, so one stored document serves every query.
export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  return (
    <main>
      <h1 id="heading">Search params</h1>
      <Suspense fallback={<p id="fallback">Loading…</p>}>
        <Query searchParams={searchParams} />
      </Suspense>
    </main>
  )
}

async function Query({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  return <p id="dynamic">q: {q}</p>
}
