import { cookies } from 'next/headers'
import { Suspense } from 'react'
import { cachedDelay, DebugRenderKind } from '../shared'

export default async function Layout({ children }) {
  return (
    <main>
      <div>
        <h2>Shared layout</h2>
        <DebugRenderKind />
        <p id="shared-layout-description">
          This shared layout uses cookies and no uncached IO, so it should be
          completely runtime-prefetchable.
        </p>
        <Suspense fallback={<div style={{ color: 'grey' }}>Loading 1...</div>}>
          <RuntimePrefetchable />
        </Suspense>
      </div>
      <hr />
      {children}
    </main>
  )
}

async function RuntimePrefetchable() {
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get('testCookie')?.value ?? null
  await cachedDelay([__filename, cookieValue])
  return (
    <div style={{ border: '1px solid blue', padding: '1em' }}>
      <div id="cookie-value-layout">{`Cookie from layout: ${cookieValue}`}</div>
    </div>
  )
}
