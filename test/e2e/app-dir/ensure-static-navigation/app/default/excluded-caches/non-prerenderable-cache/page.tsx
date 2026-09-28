import { cacheLife } from 'next/cache'
import { Suspense } from 'react'

export const unstable_ensureStatic = 'navigation'

export default function Page() {
  return (
    <main>
      <Suspense fallback={<p>Loading...</p>}>
        <Inner />
      </Suspense>
    </main>
  )
}

async function Inner() {
  await nonPrerenderableCache()
  return <p>Non-prerenderable data</p>
}

async function nonPrerenderableCache() {
  'use cache'
  cacheLife({ expire: 300 - 1 }) // smaller than MIN_PRERENDERABLE_EXPIRE
  await new Promise((resolve) => setTimeout(resolve))
  return Date.now()
}
