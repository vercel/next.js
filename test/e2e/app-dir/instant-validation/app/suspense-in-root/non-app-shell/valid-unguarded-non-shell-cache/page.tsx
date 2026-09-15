import { Instant } from 'next'
import { cacheLife } from 'next/cache'

export const instant: Instant = {
  level: 'experimental-error',
}

export default function Page() {
  return (
    <main>
      <p>
        This page uses uses a cache that is excluded from the shell due to a
        short staletime. The cache is still included in static prerenders, so
        it's allowed outside of Partial Prefetching.
      </p>
      <PrefetchContent />
    </main>
  )
}

async function PrefetchContent() {
  await nonShellCache()
  return <div>{`Prefetch content`}</div>
}

async function nonShellCache() {
  'use cache'
  cacheLife({ stale: 300 - 1 }) // smaller than MIN_SHELL_STALE
  await new Promise((resolve) => setTimeout(resolve))
  return Date.now()
}
