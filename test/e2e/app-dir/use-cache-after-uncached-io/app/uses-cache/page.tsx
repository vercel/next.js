import { cacheLife, cacheTag } from 'next/cache'
import { Suspense } from 'react'

export default function Page() {
  return (
    <main>
      This page uses a cache
      <Suspense fallback={<p id="fallback">Loading…</p>}>
        <Late />
      </Suspense>
    </main>
  )
}

async function Late() {
  // In a prerender, this will resolve after the prerender is already aborted
  // (both in prospective and final prerenders)
  await new Promise((resolve) => setTimeout(resolve, 1000))

  try {
    const result = await getCachedData()
    return <p id="data">{result}</p>
  } finally {
    console.log('after-cache-read')
  }
}

async function getCachedData(): Promise<string> {
  'use cache'
  cacheLife('hours')
  cacheTag('data')

  console.log('running getCachedData')

  return 'cached-data: ' + Date.now()
}
