import { Suspense } from 'react'
import { cacheLife } from 'next/cache'
import { Instant } from 'next'

export const instant: Instant = {
  level: 'experimental-error',
}

export const prefetch = 'partial'

export default function Page() {
  return (
    <main>
      <p>
        This page uses uses a cache that is excluded from the shell due to a
        short staletime, but it guards it with Suspense, so we can render a
        shell.
      </p>
      <Suspense fallback={<div>Loading prefetch content...</div>}>
        <PrefetchContent />
      </Suspense>
    </main>
  )
}

async function PrefetchContent() {
  await nonShellCache()
  return <div id="prefetch-content">{`Prefetch content`}</div>
}

async function nonShellCache() {
  'use cache'
  cacheLife({ stale: 300 - 1 }) // smaller than MIN_SHELL_STALE
  await new Promise((resolve) => setTimeout(resolve))
  return Date.now()
}
