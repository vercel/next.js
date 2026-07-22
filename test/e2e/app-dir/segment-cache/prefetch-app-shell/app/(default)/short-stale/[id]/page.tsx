import { Suspense } from 'react'
import { cacheLife } from 'next/cache'
import { connection } from 'next/server'

type Params = { id: string }

export const prefetch = 'allow-runtime'

// This page mixes cached content with different stale times. Cached content
// with a stale time of at least 5 minutes is part of the App Shell. Cached
// content with a shorter stale time is excluded from the App Shell — it
// resolves in the post-shell stage — so the shell can be reused on the client
// for longer than the content's stale time.
export default function Page({ params }: { params: Promise<Params> }) {
  return (
    <main>
      {/* stale: 5 minutes (the App Shell threshold) — included in the
          App Shell. */}
      <Suspense
        fallback={<p id="long-stale-loading">Loading long-lived content...</p>}
      >
        <LongStaleCached />
      </Suspense>
      {/* stale: 60 seconds (below the App Shell threshold) — excluded from
          the App Shell. */}
      <Suspense
        fallback={
          <p id="short-stale-loading">Loading short-lived content...</p>
        }
      >
        <ShortStaleCached />
      </Suspense>
      {/* The fallback is the App Shell — the part of the page that
          doesn't depend on params. */}
      <Suspense fallback={<p id="shell">App shell for short-stale</p>}>
        <ParamsDependent params={params} />
      </Suspense>
    </main>
  )
}

async function LongStaleCached() {
  'use cache'
  cacheLife('hours') // stale: 5 minutes
  return <p id="long-stale-content">Long-lived cached content</p>
}

async function ShortStaleCached() {
  'use cache'
  cacheLife({ stale: 60 }) // revalidate and expire use the default profile
  return <p id="short-stale-content">Short-lived cached content</p>
}

async function ParamsDependent({ params }: { params: Promise<Params> }) {
  const { id } = await params
  return (
    <>
      <p id="param-value">{`Post ${id}`}</p>
      <Suspense
        fallback={<p id="dynamic-loading">Loading dynamic content...</p>}
      >
        <Dynamic id={id} />
      </Suspense>
    </>
  )
}

async function Dynamic({ id }: { id: string }) {
  await connection()
  return <p id="dynamic-content">{`Post body for ${id}`}</p>
}
