import { Suspense } from 'react'
import { cachedDelay, DebugRenderKind, uncachedIO } from '../../../shared'
import { connection } from 'next/server'

export const unstable_prefetch = {
  mode: 'runtime',
  samples: [{ cookies: [] }],
}

export default async function Page() {
  return (
    <main>
      <DebugRenderKind />
      <p>
        This page uses Date.now (in a private cache) and some uncached IO, so
        parts of it should be runtime-prefetchable.
      </p>
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 1...</div>}>
        <RuntimePrefetchable />
      </Suspense>
    </main>
  )
}

async function RuntimePrefetchable() {
  const now = await privateCache()
  return (
    <div style={{ border: '1px solid blue', padding: '1em' }}>
      <div id="timestamp">{`Timestamp: ${now}`}</div>
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 2...</div>}>
        <Dynamic />
      </Suspense>
    </div>
  )
}

async function privateCache() {
  'use cache: private'
  const now = Date.now()
  await cachedDelay([__filename])
  return now
}

async function Dynamic() {
  await uncachedIO()
  await connection()
  return (
    <div style={{ border: '1px solid tomato', padding: '1em' }}>
      <div id="dynamic-content">Dynamic content</div>
    </div>
  )
}
