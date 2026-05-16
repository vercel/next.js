import { Suspense } from 'react'
import Link from 'next/link'

export default async function Page() {
  return (
    <main>
      <section>
        <p>
          This page has has a slow to fill cache. When not bypassing the dev
          cache the initial load should be slow while the cache warms up. You
          won't see the Suspense fallback because the entire response is blocked
          until the cache warms up. Subsequent loads should be fast because the
          cache is warm and nothing needs to Suspend When bypassing caches in
          dev with "disable cache" the request should instantly show a fallback
          UI and show the final content after the delay.
        </p>
      </section>
      <section>
        <Suspense fallback={<p>Loading from cache...</p>}>
          <CachedData />
        </Suspense>
      </section>
      <Link href="/other">/Other</Link>
    </main>
  )
}

async function CachedData() {
  'use cache'

  await new Promise((r) => setTimeout(r, 2000))

  return <p>{42}</p>
}
