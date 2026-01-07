import { Suspense } from 'react'
import { cachedDelay, DebugRenderKind, uncachedIO } from '../../../../shared'
import { connection } from 'next/server'
import { lang } from 'next/root-params'

export const unstable_prefetch = {
  mode: 'runtime',
  samples: [{ params: { lang: 'en' } }],
}

export default async function Page() {
  return (
    <main>
      <DebugRenderKind />
      <p>
        This page uses root params (inside a private cache) and some uncached
        IO. Private caches are only rendered during runtime prefetches and
        navigation requests, so they won't be part of a static prefetch, but
        they should be part of a runtime prefetch.
      </p>
      <Suspense fallback="Loading 1...">
        <RuntimePrefetchable />
      </Suspense>
    </main>
  )
}

async function RuntimePrefetchable() {
  const currentLang = await privateCache()
  return (
    <div style={{ border: '1px solid blue', padding: '1em' }}>
      <div id="root-param-value">{`Lang: ${currentLang}`}</div>
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 2...</div>}>
        <Dynamic />
      </Suspense>
    </div>
  )
}

async function privateCache() {
  'use cache: private'
  const currentLang = await lang()
  await cachedDelay([__filename, currentLang])
  return currentLang
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
