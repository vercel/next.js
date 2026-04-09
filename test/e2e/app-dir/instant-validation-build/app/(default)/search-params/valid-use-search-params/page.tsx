import type { Instant } from 'next'
import { Suspense } from 'react'
import { SearchParamsReader } from './search-params-reader'

export const unstable_instant: Instant = {
  prefetch: 'runtime',
  samples: [
    {
      searchParams: {
        single: 'test',
        multiple: ['a', 'b'],
        missing: null,
      },
    },
  ],
}

export default function Page() {
  return (
    <main>
      <p>
        When validated in build, useSearchParams() should receive the search
        params specified in the sample.
      </p>
      <Suspense fallback={<div>Loading...</div>}>
        <SearchParamsReader />
      </Suspense>
    </main>
  )
}
