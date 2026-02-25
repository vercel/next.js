import type { Instant } from 'next'
import { Suspense } from 'react'
import { ParamsReader } from './params-reader'

export const unstable_instant: Instant = {
  prefetch: 'static',
  samples: [
    {
      params: {
        one: '123',
        two: '456',
      },
    },
  ],
}

export default function Page() {
  return (
    <main>
      <p>
        When validated in build, useParams() should receive the params specified
        in the sample.
      </p>
      <Suspense fallback={<div>Loading...</div>}>
        <ParamsReader />
      </Suspense>
    </main>
  )
}
