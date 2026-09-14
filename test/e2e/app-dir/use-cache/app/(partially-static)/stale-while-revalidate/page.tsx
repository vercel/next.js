import { connection } from 'next/server'
import { cacheLife } from 'next/cache'
import { Suspense } from 'react'

async function getCachedValue() {
  // A request-time cache (after `connection()`) uses a remote cache: a plain
  // `'use cache'` is a no-op on a deployment without a memory cache. With no
  // remote handler configured this falls back to the default handler, which
  // does have a memory cache under `next start` and `next dev`.
  'use cache: remote'
  // A short `revalidate` so the entry goes stale quickly, paired with a long
  // `expire` that keeps it well inside the dev stale-while-revalidate window.
  cacheLife({ stale: 30, revalidate: 2, expire: 300 })
  return Math.random()
}

async function Dynamic() {
  // Render at request time so the page isn't prerendered as static HTML.
  await connection()
  return <p id="value">{await getCachedValue()}</p>
}

export default function Page() {
  return (
    <Suspense fallback={<p id="loading">Loading...</p>}>
      <Dynamic />
    </Suspense>
  )
}
