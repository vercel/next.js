import { Instant } from 'next'
import { cacheLife } from 'next/cache'

export const instant: Instant = {
  level: 'experimental-error',
}

export default function Page() {
  return (
    <main>
      <p>
        This page uses uses a cache that is excluded from prerenders due to a
        short staletime, so we can't prefetch it in any way.
      </p>
      <DynamicContent />
    </main>
  )
}

async function DynamicContent() {
  await nonPrefetchableCache()
  return <div>{`Dynamic content`}</div>
}

async function nonPrefetchableCache() {
  'use cache'
  cacheLife({ stale: 30 - 1 }) // smaller than MIN_PREFETCHABLE_STALE
  await new Promise((resolve) => setTimeout(resolve))
  return Date.now()
}
