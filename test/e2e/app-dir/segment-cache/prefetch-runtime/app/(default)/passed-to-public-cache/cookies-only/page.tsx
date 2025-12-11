import { cookies } from 'next/headers'
import { Suspense } from 'react'
import { cachedDelay, DebugRenderKind } from '../../../shared'

export const unstable_prefetch = {
  mode: 'runtime',
  samples: [{ cookies: [{ name: 'testCookie', value: 'testValue' }] }],
}

export default async function Page() {
  return (
    <main>
      <DebugRenderKind />
      <p>
        This page uses cookies (from a private cache) and no uncached IO, So it
        should be completely prefetchable with a runtime prefetch.
      </p>
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 1...</div>}>
        <RuntimePrefetchable />
      </Suspense>
    </main>
  )
}

async function RuntimePrefetchable() {
  await cookies() // Guard from being statically prerendered, which would make the cache hang

  // We've already awaited cookies, but we still want to make sure
  // that the cache doesn't consider them a hanging promise
  const cookieValue = await publicCache(
    cookies().then(
      (cookieStore) => cookieStore.get('testCookie')?.value ?? null
    )
  )
  return (
    <div style={{ border: '1px solid blue', padding: '1em' }}>
      <div id="cookie-value">{`Cookie: ${cookieValue}`}</div>
    </div>
  )
}

async function publicCache(cookiePromise: Promise<string | null>) {
  'use cache'
  const cookieValue = await cookiePromise
  await cachedDelay([__filename, cookieValue])
  return cookieValue
}
