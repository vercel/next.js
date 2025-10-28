import { Suspense } from 'react'
import { cachedDelay, DebugRenderKind } from '../../../shared'
import { cacheLife } from 'next/cache'

export default async function Page() {
  return (
    <main>
      <DebugRenderKind />
      <p id="intro">
        This page uses a short-lived public cache (with cacheLife("seconds")),
        which should not be included in a static prefetch, but should be
        included in a runtime prefetch, because it has a long enough stale time
        (&ge; RUNTIME_PREFETCH_DYNAMIC_STALE, 30s)
      </p>
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading...</div>}>
        <ShortLivedCache />
      </Suspense>
    </main>
  )
}

async function ShortLivedCache() {
  'use cache'
  cacheLife('seconds')
  await cachedDelay([__filename])

  return (
    <div style={{ border: '1px solid blue', padding: '1em' }}>
      Short-lived cached content
      <div id="cached-value">{Date.now()}</div>
    </div>
  )
}
