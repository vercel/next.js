import { Suspense } from 'react'
import { connection } from 'next/server'
import { cacheTag } from 'next/cache'

// A cached value in the shell and a hole. Revalidating the tag (POST
// /revalidate) changes the stored document.
export default async function Page() {
  return (
    <main>
      <h1 id="heading">Revalidated shell</h1>
      <p id="static-value">Cached at: {await getCachedAt()}</p>
      <Suspense fallback={<p id="fallback">Loading…</p>}>
        <Now />
      </Suspense>
    </main>
  )
}

async function getCachedAt() {
  'use cache'
  cacheTag('ppr-cdn-mode:revalidate')
  return Date.now()
}

async function Now() {
  await connection()
  return <p id="dynamic">Now: {Date.now()}</p>
}
