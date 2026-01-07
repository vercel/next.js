import { headers } from 'next/headers'
import { Suspense } from 'react'
import { cachedDelay, DebugRenderKind } from '../../../shared'
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
        This page passes headers to a public cache, and uses some uncached IO,
        so parts of it should be prefetchable with a runtime prefetch.
      </p>
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 1...</div>}>
        <RuntimePrefetchable />
      </Suspense>
    </main>
  )
}

async function RuntimePrefetchable() {
  await headers() // Guard from being statically prerendered, which would make the cache hang

  // We've already awaited headers, but we still want to make sure
  // that the cache doesn't consider them a hanging promise
  const headerValue = await publicCache(
    headers().then((headersStore) =>
      headersStore.get('host') === null ? 'missing' : 'present'
    )
  )
  return (
    <div style={{ border: '1px solid blue', padding: '1em' }}>
      <div id="header-value">{`Header: ${headerValue}`}</div>
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 2...</div>}>
        <Dynamic />
      </Suspense>
    </div>
  )
}

async function publicCache(headerPromise: Promise<string>) {
  'use cache'
  const headerValue = await headerPromise
  await cachedDelay([__filename, headerValue])
  return headerValue
}

async function Dynamic() {
  await connection()
  return (
    <div style={{ border: '1px solid tomato', padding: '1em' }}>
      <div id="dynamic-content">Dynamic content</div>
    </div>
  )
}
