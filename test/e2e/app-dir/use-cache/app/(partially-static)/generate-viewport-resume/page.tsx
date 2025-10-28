import { Viewport } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'

export async function generateViewport({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<Viewport> {
  'use cache'

  // Explicitly not reading search params here. The search params should be
  // omitted from the cache key, so that we ensure a cache hit when resuming the
  // partially prerendered page.

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
