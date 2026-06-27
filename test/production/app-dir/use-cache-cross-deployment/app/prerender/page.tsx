import { Suspense } from 'react'
import { cacheLife } from 'next/cache'
import { getDate } from '../logic'

// The id prop is just used to assert on the logged cache key in tests.
async function DynamicCache({ id }: { id: string }) {
  'use cache: remote'
  cacheLife('days')
  return <span id="data">{getDate()}</span>
}

export default function Page() {
  return (
    <p>
      This page uses a short-lived "use cache", which is omitted from the
      prerender, but should still be saved in the cache handler.
      <Suspense>
        <DynamicCache id="dynamic-cache" />
      </Suspense>
    </p>
  )
}
