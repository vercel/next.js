import { cookies } from 'next/headers'
import { Suspense } from 'react'
import { DebugRenderKind } from '../../../shared'

// No `export const unstable_prefetch = ...` is needed, we default to static

export default async function SubLayout({ children }) {
  return (
    <main>
      <div>
        <h3>Sub-layout</h3>
        <DebugRenderKind />
        <p id="static-content-sub-layout">
          This sub-layout uses cookies, but did not specify that it should be
          runtime prefetchable, so it should be prefetched statically by
          default.
        </p>
        <Suspense
          fallback={
            <div id="runtime-prefetchable-fallback-sub-layout">Loading ...</div>
          }
        >
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
    <div id="runtime-prefetchable-content-sub-layout">
      Runtime-prefetchable content from sub-layout
    </div>
  )
}
