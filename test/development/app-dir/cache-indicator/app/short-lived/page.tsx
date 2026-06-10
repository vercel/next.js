import { cacheLife } from 'next/cache'
import { Suspense } from 'react'

async function ShortLivedData() {
  'use cache'
  // TODO(make-dev-fast): This should be able to use `cacheLife('seconds')`. We
  // use a long `revalidate` instead so the entry stays a fresh hit on the warm
  // reload of the page, isolating this test from the in-memory handler dropping
  // the entry at `revalidate` (and thus from dev SWR). `expire` stays under 5
  // minutes so it is still short-lived (deferred, out of the static shell).
  // Once the dev in-memory handler serves stale entries (SWR), flip this back
  // to `cacheLife('seconds')`.
  cacheLife({ stale: 30, revalidate: 120, expire: 240 })
  await new Promise((resolve) => setTimeout(resolve, 100))
  return <p id="short-lived">{Math.random()}</p>
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <ShortLivedData />
    </Suspense>
  )
}
