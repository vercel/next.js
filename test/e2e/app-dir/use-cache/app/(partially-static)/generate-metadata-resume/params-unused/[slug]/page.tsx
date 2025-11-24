import { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'

export async function generateMetadata(_: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  'use cache'

  // Explicitly not reading params here. The title should appear in the
  // partially prerendered page. TODO: When resuming the page, we should get a
  // cache hit (from the RDC), but omitting unused params from cache keys (and
  // upgrading cache keys when they are used) is not yet implemented.

  // Make sure this cache doesn't resolve instantly,
  // so that if it causes a cache miss, it's noticeable.
  await new Promise((resolve) => setTimeout(resolve, 5))

  return { title: new Date().toISOString() }
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Dynamic />
    </Suspense>
  )
}

async function Dynamic() {
  await connection()

  return <p>Dynamic</p>
}
