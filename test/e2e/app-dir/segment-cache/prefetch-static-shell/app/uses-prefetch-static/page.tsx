import { Suspense } from 'react'
import { unstable_prefetch } from 'next/cache'

export default function Page() {
  return (
    <main>
      <Suspense fallback={<p id="prefetch-loading">Loading prefetch...</p>}>
        <PrefetchContent />
      </Suspense>
    </main>
  )
}

async function PrefetchContent() {
  await unstable_prefetch()
  return <p id="page-content">Fully static page content (with prefetch())</p>
}
