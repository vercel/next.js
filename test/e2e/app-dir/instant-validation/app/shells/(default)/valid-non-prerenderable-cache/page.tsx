import { Instant } from 'next'
import { cacheLife } from 'next/cache'

export const instant: Instant = {
  level: 'experimental-error',
}

export const prefetch = 'partial'

export default function Page() {
  return (
    <main>
      <p>
        This page uses uses a cache that is excluded from static prerenders due
        to a short expire. In Partial Prefetching, we can use a runtime
        prerender instead, so this is allowed.
      </p>
      <SessionContent />
    </main>
  )
}

async function SessionContent() {
  await nonPrerenderableCache()
  return <div>{`Session content`}</div>
}

async function nonPrerenderableCache() {
  'use cache'
  cacheLife({ expire: 300 - 1 }) // smaller than MIN_PRERENDERABLE_EXPIRE
  await new Promise((resolve) => setTimeout(resolve))
  return Date.now()
}
