import { Suspense } from 'react'
import { cacheLife } from 'next/cache'
import { cookies } from 'next/headers'

export default function Page() {
  return (
    <Suspense fallback="Loading...">
      <RuntimePrefetchable />
    </Suspense>
  )
}

async function RuntimePrefetchable() {
  // Prevent this content from appearing in a regular prerender,
  // But allow it to be included in a runtime prefetch.
  await cookies()

  return (
    <Suspense fallback="Loading...">
      <Content />
    </Suspense>
  )
}

async function Content() {
  'use cache'
  await new Promise((resolve) => setTimeout(resolve, 0))
  cacheLife({ stale: 10 * 60 })
  return 'Content with stale time of 10 minutes'
}
