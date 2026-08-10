import { cacheLife } from 'next/cache'
import { Suspense } from 'react'

async function ShortLivedData() {
  'use cache'
  // A short-lived profile (`seconds`): out of the static shell, deferred to the
  // runtime stage. On a warm reload the entry may be past its 1s revalidate,
  // but the dev server serves it stale (SWR), so the reload is a cache hit and
  // does not show the cold-cache badge.
  cacheLife('seconds')
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
