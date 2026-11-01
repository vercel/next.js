import { cacheLife } from 'next/cache'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { tasky } from '../../../utils'

async function getCachedNow() {
  'use cache'
  // prerenderable and prefetchable.
  cacheLife('frequent')

  await tasky()
  return `prerenderable: ${Date.now()}`
}

async function NonPrerenderableCache() {
  'use cache'
  // Not prerenderable and not prefetchable.
  cacheLife({
    revalidate: 99,
    expire: 299, // < MIN_PRERENDERABLE_EXPIRE
    stale: 18, // < MIN_PREFETCHABLE_STALE
  })
  return <p id="non-prerenderable">{`non-prerenderable: ${Date.now()}`}</p>
}

async function Dynamic() {
  await connection()
  return null
}

export default async function Page() {
  const cachedNow = await getCachedNow()
  return (
    <main>
      <p id="prerenderable">{cachedNow}</p>
      <Suspense fallback={<p id="non-prerenderable">Loading...</p>}>
        <NonPrerenderableCache />
      </Suspense>
      <Suspense>
        <Dynamic />
      </Suspense>
    </main>
  )
}
