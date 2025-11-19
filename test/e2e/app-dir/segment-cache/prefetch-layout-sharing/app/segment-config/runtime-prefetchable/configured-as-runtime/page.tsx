import { cookies } from 'next/headers'
import { Suspense } from 'react'

export const unstable_prefetch = {
  mode: 'runtime',
  samples: [{ cookies: [] }],
}

export default function Page() {
  return (
    <main>
      <h1 style={{ color: 'green' }}>
        A runtime-prefetchable child of a runtime-prefetchable layout
      </h1>
      <p id="static-content-page">
        This page has two relevant parent layouts:
        <br />
        1. A runtime-prefetchable shared layout layout.
        <br />
        2. A statically-prefetchable sub-layout not shared with other pages.
        <br />
        <br />
        We should use a runtime prefetch for it without any overrides on Link,
        but its sub-layout should be prefetched statically.
      </p>
      <Suspense fallback="Loading...">
        <RuntimePrefetchable />
      </Suspense>
    </main>
  )
}

async function RuntimePrefetchable() {
  await cookies()
  return (
    <div id="runtime-prefetchable-content-page">
      Runtime-prefetchable content from page
    </div>
  )
}
