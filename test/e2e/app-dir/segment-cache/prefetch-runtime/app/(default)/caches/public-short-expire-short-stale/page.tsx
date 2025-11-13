import { Suspense } from 'react'
import { cachedDelay, DebugRenderKind } from '../../../shared'
import { cacheLife } from 'next/cache'

export default async function Page() {
  return (
    <main>
      <DebugRenderKind />
      <p id="intro">
        This page uses a short-lived public cache (expire &lt; DYNAMIC_EXPIRE,
        5min), which should not be included in a static prefetch, and should
        also not be included in a runtime prefetch, because it has a short
        enough stale time (&lt; RUNTIME_PREFETCH_DYNAMIC_STALE, 30s)
      </p>
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading...</div>}>
        <ShortLivedCache />
      </Suspense>
    </main>
  )
}

async function ShortLivedCache() {
  'use cache'
  cacheLife({
    stale: 20, // < RUNTIME_PREFETCH_DYNAMIC_STALE
    revalidate: 2 * 60,
    expire: 3 * 60, // < DYNAMIC_EXPIRE
  })
  await cachedDelay([__filename])

  return (
    <div style={{ border: '1px solid blue', padding: '1em' }}>
      Short-lived cached content
      <div id="cached-value">{Date.now()}</div>
    </div>
  )
}
