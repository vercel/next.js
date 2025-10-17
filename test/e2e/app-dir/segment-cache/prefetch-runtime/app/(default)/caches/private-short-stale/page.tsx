import { Suspense } from 'react'
import { cachedDelay, DebugRenderKind } from '../../../shared'
import { cacheLife } from 'next/cache'

export default async function Page() {
  return (
    <main>
      <DebugRenderKind />
      <p id="intro">
        This page uses a short-lived private cache (staleTime &lt;
        RUNTIME_PREFETCH_DYNAMIC_STALE, which is 30s), which should not be
        included in a runtime prefetch
      </p>
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading...</div>}>
        <CachedButShortLived />
      </Suspense>
    </main>
  )
}

async function CachedButShortLived() {
  'use cache: private'
  cacheLife({
    stale: 5,
    // the rest of the settings don't matter for private caches,
    // because they are not persisted server-side
  })
  await cachedDelay([__filename])

  return (
    <div style={{ border: '1px solid blue', padding: '1em' }}>
      Short-lived cached content
      <div id="cached-value">{Date.now()}</div>
    </div>
  )
}
