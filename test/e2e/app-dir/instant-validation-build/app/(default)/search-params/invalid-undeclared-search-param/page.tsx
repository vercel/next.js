import { Suspense } from 'react'

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{ searchParams: { q: 'test' } }],
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; undeclared?: string }>
}) {
  return (
    <main>
      <p>
        This page reads a searchParam that is not declared in the sample, so it
        should fail validation with an exhaustiveness error.
      </p>
      <Suspense fallback={<div>Loading...</div>}>
        <SearchResult searchParams={searchParams} />
      </Suspense>
    </main>
  )
}

async function SearchResult({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; undeclared?: string }>
}) {
  const { q, undeclared } = await searchParams
  return (
    <div id="search-result">
      query: {q}, undeclared: {undeclared}
    </div>
  )
}
