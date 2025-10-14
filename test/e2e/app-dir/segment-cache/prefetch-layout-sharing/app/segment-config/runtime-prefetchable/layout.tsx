import { cookies } from 'next/headers'
import { Suspense } from 'react'
import { DebugRenderKind } from '../../shared'

export const unstable_prefetch = {
  mode: 'runtime',
  samples: [{ cookies: [] }],
}
export default async function Layout({ children }) {
  return (
    <main>
      <div>
        <h2>Shared layout</h2>
        <DebugRenderKind />
        <p id="static-content-layout">
          This shared layout uses cookies and no uncached IO, so it should be
          completely runtime-prefetchable.
        </p>
        <Suspense fallback="Loading ...">
          <RuntimePrefetchable />
        </Suspense>
      </div>
      <hr />
      {children}
    </main>
  )
}

async function RuntimePrefetchable() {
  await cookies()
  return (
    <div id="runtime-prefetchable-content-layout">
      Runtime-prefetchable content from shared layout
    </div>
  )
}
