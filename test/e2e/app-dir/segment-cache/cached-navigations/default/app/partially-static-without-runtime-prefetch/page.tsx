import { connection } from 'next/server'
import { Suspense } from 'react'

// A partial prerender that doesn't opt into Partial Prefetching, so its
// responses don't embed a runtime prefetch.
export default function Page() {
  return (
    <main>
      <CachedContent />
      <div id="connection-boundary">
        <Suspense fallback={<p>Loading connection...</p>}>
          <ConnectionContent />
        </Suspense>
      </div>
    </main>
  )
}

async function CachedContent() {
  'use cache'
  return <p id="cached-content">Cached content</p>
}

async function ConnectionContent() {
  await connection()
  return <p>Dynamic content ({new Date().toISOString()})</p>
}
