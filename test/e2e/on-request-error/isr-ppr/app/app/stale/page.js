import { Suspense } from 'react'
import { cacheLife } from 'next/cache'

async function getCachedData() {
  'use cache'
  cacheLife({ stale: 1, revalidate: 1, expire: 60 })

  // Only throw during ISR revalidation, not during build
  if (process.env.NEXT_PHASE !== 'phase-production-build') {
    throw new Error('ppr:stale')
  }
  return Date.now()
}

async function CachedContent() {
  const data = await getCachedData()
  return <p>{data}</p>
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <CachedContent />
    </Suspense>
  )
}
