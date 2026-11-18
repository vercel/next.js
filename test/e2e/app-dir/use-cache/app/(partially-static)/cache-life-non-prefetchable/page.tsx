import { cacheLife } from 'next/cache'
import { Suspense } from 'react'
import { tasky } from '../../../utils'

async function getCachedNow() {
  'use cache'
  // Long-lived (stale >= MIN_PREFETCHABLE_STALE, expire >=
  // MIN_PRERENDERABLE_EXPIRE): stays in the static shell.
  cacheLife({ stale: 60, revalidate: 100, expire: 1000 })

  await tasky()
  return `prerenderable: ${Date.now()}`
}

async function NonPrefetchableCache() {
  'use cache'
  // Long expire (>= MIN_PRERENDERABLE_EXPIRE, 5min) and a non-zero revalidate,
  // but a stale time below MIN_PREFETCHABLE_STALE (30s). This isolates the
  // short-stale exclusion: the entry is omitted from the static shell purely
  // because of its short stale time, not because of a short expire or
  // revalidate: 0.
  cacheLife({ stale: 18, revalidate: 100, expire: 1000 })
  return <p id="non-prefetchable">{`non-prefetchable: ${Date.now()}`}</p>
}

export default async function Page() {
  const cachedNow = await getCachedNow()
  return (
    <main>
      <p id="prerenderable">{cachedNow}</p>
      <Suspense fallback={<p id="non-prefetchable">Loading...</p>}>
        <NonPrefetchableCache />
      </Suspense>
    </main>
  )
}
