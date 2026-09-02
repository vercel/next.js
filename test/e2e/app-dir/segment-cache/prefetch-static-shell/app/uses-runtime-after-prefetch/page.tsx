// A page that calls cookies and headers after awaiting `unstable_prefetch()`.
// Unlike `navigation()`, `prefetch()` doesn't stop runtime-data tracking — the
// reads below it still count — so the tree hint stays unset and this route
// can't be prefetched statically.

import { cookies, headers } from 'next/headers'
import { unstable_prefetch } from 'next/cache'
import { Suspense } from 'react'

export default async function Page() {
  return (
    <main>
      <p id="page-content">Runtime APIs called after prefetch()</p>
      <Suspense
        fallback={<p id="prefetch-loading">Loading prefetch content...</p>}
      >
        <Prefetch />
      </Suspense>
    </main>
  )
}

async function Prefetch() {
  await unstable_prefetch()

  return (
    <>
      <div id="prefetch-content">Prefetch content</div>
      <Suspense
        fallback={<p id="runtime-loading">Loading runtime content...</p>}
      >
        <RuntimeContent />
      </Suspense>
    </>
  )
}

async function RuntimeContent() {
  await Promise.all([cookies(), headers()])
  return <p id="runtime-content">Runtime content</p>
}
