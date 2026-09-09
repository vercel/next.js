import { Suspense } from 'react'
import { cacheLife } from 'next/cache'

export default function Page() {
  return (
    <main>
      <p id="page-content">Uses a cache that is excluded from all prerenders</p>
      <Suspense fallback={<p id="cache-loading">Loading cache...</p>}>
        <CacheContent />
      </Suspense>
    </main>
  )
}

async function CacheContent() {
  const value = await nonPrefetchableCache()
  return <div id="cache-content">{`Cache value: ${value}`}</div>
}

async function nonPrefetchableCache() {
  'use cache'
  cacheLife({ stale: 30 - 1 }) // smaller than MIN_PREFETCHABLE_STALE
  await new Promise((resolve) => setTimeout(resolve))
  return Date.now()
}
