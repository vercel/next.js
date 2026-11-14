import { cacheLife, navigation, prefetch } from 'next/cache'
import { Suspense } from 'react'

async function cachedValue() {
  'use cache'
  // Excluded from the shell, but eligible for a complete navigation prerender.
  cacheLife({ stale: 60, revalidate: 300, expire: 600 })
  return 'Cached navigation content'
}

async function PrefetchContent() {
  await prefetch()
  return <p id="prefetch">Prefetch content</p>
}

async function NavigationContent() {
  await navigation()
  return <p id="navigation">{await cachedValue()}</p>
}

export default function Page() {
  return (
    <>
      <Suspense fallback={<p>Loading prefetch...</p>}>
        <PrefetchContent />
      </Suspense>
      <Suspense fallback={<p>Loading navigation...</p>}>
        <NavigationContent />
      </Suspense>
    </>
  )
}
