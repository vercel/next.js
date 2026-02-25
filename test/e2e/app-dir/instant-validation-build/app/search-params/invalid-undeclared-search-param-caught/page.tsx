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
        should fail validation with an exhaustiveness error. It catches the
        error thrown by the searchParam access, but validation should still
        fail.
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
  const sp = await searchParams

  try {
    const undeclared = sp.undeclared // this should throw
    // prevent DCE of unused expression
    if (Math.random() > 1) {
      console.log(undeclared)
    }
  } catch (err) {
    // We swallow the error. It should still be reported and fail the validation.
  }

  return <div id="search-result">query: {sp.q}</div>
}
