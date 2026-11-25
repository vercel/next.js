import { Suspense } from 'react'
import { cacheLife } from 'next/cache'

export default function Page() {
  return (
    <main>
      <p id="page-content">Uses a cache that is excluded from shells</p>
      <Suspense fallback={<p id="cache-loading">Loading cache...</p>}>
        <CacheContent />
      </Suspense>
    </main>
  )
}

async function CacheContent() {
  const value = await nonShellCache()
  return <div id="cache-content">{`Cache value: ${value}`}</div>
}

async function nonShellCache() {
  'use cache'
  cacheLife({ stale: 300 - 1 }) // smaller than MIN_SHELL_STALE
  await new Promise((resolve) => setTimeout(resolve))
  return Date.now()
}
