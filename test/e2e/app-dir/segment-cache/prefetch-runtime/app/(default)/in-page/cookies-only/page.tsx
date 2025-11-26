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
        This page uses cookies and no uncached IO, So it should be completely
        prefetchable with a runtime prefetch.
      </p>
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 1...</div>}>
        <RuntimePrefetchable />
      </Suspense>
    </main>
  )
}

async function RuntimePrefetchable() {
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get('testCookie')?.value ?? null
  await cachedDelay([__filename, cookieValue])
  return (
    <div style={{ border: '1px solid blue', padding: '1em' }}>
      <div id="cookie-value">{`Cookie: ${cookieValue}`}</div>
    </div>
  )
}
