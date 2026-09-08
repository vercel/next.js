'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

export default function UseSearchParamsPage() {
  return (
    <div>
      <h1 data-testid="use-search-params-title">Use Search Params Page</h1>
      <Suspense
        fallback={
          <div data-testid="use-search-params-fallback">
            Loading search params...
          </div>
        }
      >
        <SearchParamsReader />
      </Suspense>
    </div>
  )
}

function SearchParamsReader() {
  const searchParams = useSearchParams()
  return (
    <div data-testid="use-search-params-content">
      foo: {searchParams.get('foo') ?? 'not set'}
    </div>
  )
}
