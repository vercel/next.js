import { Viewport } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'

export async function generateViewport({
  params,
}: {
  params: Promise<{ color: string }>
}): Promise<Viewport> {
  'use cache'

  // Explicitly not reading params here. The meta tag should appear in the
  // partially prerendered page. TODO: When resuming the page, we should get a
  // cache hit (from the RDC), but omitting unused params from cache keys (and
  // upgrading cache keys when they are used) is not yet implemented.

  return { initialScale: Math.random() }
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
