import { headers } from 'next/headers'
import { Suspense } from 'react'
import { cachedDelay, DebugRenderKind, uncachedIO } from '../../../shared'
import { connection } from 'next/server'

export const unstable_prefetch = {
  mode: 'runtime',
  samples: [{ headers: [['host', 'test-host']] }],
}

export default async function Page() {
  return (
    <main>
      <DebugRenderKind />
      <p>
        This page uses headers and some uncached IO, so parts of it should be
        runtime-prefetchable.
      </p>
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 1...</div>}>
        <RuntimePrefetchable />
      </Suspense>
    </main>
  )
}

async function RuntimePrefetchable() {
  const headersStore = await headers()
  const headerValue = headersStore.get('host') === null ? 'missing' : 'present'
  await cachedDelay([__filename, headerValue])
  return (
    <div style={{ border: '1px solid blue', padding: '1em' }}>
      <div id="header-value">{`Header: ${headerValue}`}</div>
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 2...</div>}>
        <Dynamic />
      </Suspense>
    </div>
  )
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
