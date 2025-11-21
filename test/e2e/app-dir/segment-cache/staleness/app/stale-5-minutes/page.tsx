import { Suspense } from 'react'
import { cacheLife } from 'next/cache'

async function Content() {
  'use cache'
  await new Promise((resolve) => setTimeout(resolve, 0))
  cacheLife({ stale: 5 * 60 })
  return 'Content with stale time of 5 minutes'
}

export default function Page() {
  return (
    <Suspense fallback="Loading...">
      <Content />
    </Suspense>
  )
}
