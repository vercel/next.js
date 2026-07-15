import { Suspense } from 'react'
import { cacheLife } from 'next/cache'

type Params = { id: string }

// This page is fully static: all params are statically known via
// `generateStaticParams`, so the page is prerendered for every URL at build
// time. It mixes cached content with different stale times. Cached content
// with a stale time of at least 5 minutes is part of the App Shell. Cached
// content with a shorter stale time resolves in the post-shell stage: it's
// still part of the static prerender, but excluded from the App Shell prefix
// that the client extracts (using the shell byte offset in the response) and
// reuses across URLs.
export async function generateStaticParams() {
  return [{ id: '1' }, { id: '2' }, { id: '124' }]
}

export default function Page({ params }: { params: Promise<Params> }) {
  return (
    <main>
      {/* stale: 5 minutes (the App Shell threshold) — included in the
          App Shell. */}
      <Suspense
        fallback={
          <p id="static-long-stale-loading">Loading long-lived content...</p>
        }
      >
        <LongStaleCached />
      </Suspense>
      {/* stale: 60 seconds (below the App Shell threshold) — excluded from
          the App Shell. */}
      <Suspense
        fallback={
          <p id="static-short-stale-loading">Loading short-lived content...</p>
        }
      >
        <ShortStaleCached />
      </Suspense>
      <Suspense
        fallback={
          <p id="static-shell">App shell for static short-stale posts</p>
        }
      >
        <ParamsDependent params={params} />
      </Suspense>
    </main>
  )
}

async function LongStaleCached() {
  'use cache'
  cacheLife('hours') // stale: 5 minutes
  return <p id="static-long-stale-content">Long-lived cached content</p>
}

async function ShortStaleCached() {
  'use cache'
  cacheLife({ stale: 60 }) // revalidate and expire use the default profile
  return <p id="static-short-stale-content">Short-lived cached content</p>
}

async function ParamsDependent({ params }: { params: Promise<Params> }) {
  const { id } = await params
  return <p id="static-content">{`Static post ${id}`}</p>
}
