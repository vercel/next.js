import type { Instant } from 'next'
import { Suspense } from 'react'
import { SearchParamsReader } from './search-params-reader'

export const unstable_instant: Instant = {
  prefetch: 'runtime',
  samples: [
    {
      searchParams: {
        q: 'test',
      },
    },
  ],
}

export default function Page() {
  return (
    <main>
      <p>
        This page reads a searchParam via useSearchParams() that is not declared
        in the sample, so it should fail validation with an exhaustiveness
        error.
      </p>
      <Suspense fallback={<div>Loading...</div>}>
        <SearchParamsReader />
      </Suspense>
    </main>
  )
}
