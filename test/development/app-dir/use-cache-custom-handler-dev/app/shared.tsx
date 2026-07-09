import { Suspense } from 'react'
import { setTimeout } from 'timers/promises'

async function getCachedValue(slug: string) {
  'use cache'

  // A slow generation, so the cold read is clearly pending at a staged-render
  // boundary (which surfaces the cold cache indicator on the first load), and a
  // warm reload served from the front is observably different. The slug keys
  // the entry; the value itself is just a timestamp.
  await setTimeout(1000)

  return new Date().toISOString()
}

async function CachedValue({ slug }: { slug: string }) {
  const value = await getCachedValue(slug)

  return <p id="value">{value}</p>
}

// We use a distinct slug per test, so each test exercises its own cache entry and no
// cache hits are shared across tests (the first request for a slug is a genuine
// cold miss).
// NOTE: we're not using generateStaticParams because
// those resolve after the shell in `partialPrefetching`,
// and the test needs the cache to be part of the shell.
export async function PageForSlug({ slug }: { slug: string }) {
  return (
    <main>
      <Suspense fallback={<p id="loading">Loading...</p>}>
        <CachedValue slug={slug} />
      </Suspense>
    </main>
  )
}
