import { Suspense } from 'react'
import { cachedDelay, DebugRenderKind } from '../../../../shared'
import { cacheLife } from 'next/cache'

export default async function Page() {
  return (
    <main>
      <DebugRenderKind />
      <p id="intro">
        This page performs sync IO after awaiting a quickly-expiring public
        cache, so we should only see the error in a runtime prefetch
      </p>
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 1...</div>}>
        <RuntimePrefetchable />
      </Suspense>
    </main>
  )
}

async function RuntimePrefetchable() {
  await publicCache()
  return <div id="timestamp">Timestamp: {Date.now()}</div>
}

async function publicCache() {
  'use cache'
  cacheLife('seconds')
  await cachedDelay([__dirname])
}
