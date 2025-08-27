import { cookies } from 'next/headers'
import { Suspense } from 'react'

export const unstable_prefetch = 'unstable_runtime'

export default function Page() {
  return (
    <main>
      <h1>A page that should use a runtime prefetch</h1>
      <Suspense fallback="Loading...">
        <RuntimePrefetchable />
      </Suspense>
    </main>
  )
}

async function RuntimePrefetchable() {
  await cookies()
  return <div>Runtime-prefetchable content</div>
}
