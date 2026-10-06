import { Suspense } from 'react'
import { cacheLife } from 'next/cache'

export default function Page() {
  return (
    <main>
      <p id="page-content">
        Uses a cache that is excluded from static prerenders, but included in
        runtime ones
      </p>
      <Suspense fallback={<p id="cache-loading">Loading cache...</p>}>
        <CacheContent />
      </Suspense>
    </main>
  )
}

async function CacheContent() {
  const value = await nonPrerenderableCache()
  return <div id="cache-content">{`Cache value: ${value}`}</div>
}

async function nonPrerenderableCache() {
  'use cache'
  cacheLife({ expire: 300 - 1 }) // smaller than MIN_PRERENDERABLE_EXPIRE
  await new Promise((resolve) => setTimeout(resolve))
  return Date.now()
}
