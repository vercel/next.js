import { connection } from 'next/server'
import { cacheLife } from 'next/cache'
import { Suspense } from 'react'

async function revalidateZero() {
  'use cache: remote'
  cacheLife({ revalidate: 0 })

  return new Date().toISOString()
}

async function lowExpire() {
  'use cache: remote'
  cacheLife({ expire: 5 })

  return new Date().toISOString()
}

async function OuterCacheNoExplicit() {
  'use cache: remote'
  // No explicit cacheLife - this would error during prerendering, but is
  // allowed at request time (after connection()).

  return (
    <>
      <p>
        <code>revalidate=0</code>:{' '}
        <span id="revalidate-zero">{await revalidateZero()}</span>
      </p>
      <p>
        <code>expire=5</code>: <span id="low-expire">{await lowExpire()}</span>
      </p>
    </>
  )
}

async function OuterCacheExplicitShort() {
  'use cache: remote'
  // Explicit short cacheLife - excluded from prerender, becomes a dynamic hole.
  cacheLife({ revalidate: 0, expire: 5 })

  return (
    <>
      <p>
        Explicit <code>revalidate=0</code>:{' '}
        <span id="explicit-revalidate-zero">{await revalidateZero()}</span>
      </p>
      <p>
        Explicit <code>expire=5</code>:{' '}
        <span id="explicit-low-expire">{await lowExpire()}</span>
      </p>
    </>
  )
}

async function OuterCacheExplicitLong() {
  'use cache: remote'
  // Explicit long cacheLife - included in prerender despite short-lived inner
  // caches.
  cacheLife('default')

  return (
    <>
      <p>
        Explicit long (<code>revalidate=0</code> inner):{' '}
        <span id="explicit-long-revalidate-zero">{await revalidateZero()}</span>
      </p>
      <p>
        Explicit long (<code>expire=5</code> inner):{' '}
        <span id="explicit-long-low-expire">{await lowExpire()}</span>
      </p>
    </>
  )
}

async function Dynamic() {
  await connection()

  return <OuterCacheNoExplicit />
}

export default async function Page() {
  return (
    <>
      <p id="static">Static content</p>
      <Suspense fallback={<p id="dynamic">Loading...</p>}>
        <Dynamic />
      </Suspense>
      <Suspense fallback={<p>Loading explicit short...</p>}>
        <OuterCacheExplicitShort />
      </Suspense>
      <OuterCacheExplicitLong />
    </>
  )
}
