import { Suspense } from 'react'
import { cacheLife } from 'next/cache'

// The id prop is serialized into the cache key, so tests can grep the built-in
// default handler's debug output for a specific cache.
async function ShortLivedCache({ id }: { id: string }) {
  'use cache'
  cacheLife('seconds') // expire: 60, short but non-zero, still saved
  return <p id="short-lived-value">{new Date().toISOString()}</p>
}

async function ExpireZeroCache({ id }: { id: string }) {
  'use cache'
  cacheLife({ expire: 0 }) // dynamic, not saved by the default handler in prod
  return <p id="expire-zero-value">{new Date().toISOString()}</p>
}

export default function Page() {
  return (
    <main>
      <Suspense>
        <ShortLivedCache id="short-lived" />
      </Suspense>
      <Suspense>
        <ExpireZeroCache id="expire-zero" />
      </Suspense>
    </main>
  )
}
