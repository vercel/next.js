import { Suspense } from 'react'
import { setTimeout } from 'timers/promises'

// A distinct slug per test, so each test exercises its own cache entry and no
// cache hits are shared across tests (the first request for a slug is a genuine
// cold miss). Declaring the slugs also keeps `params` statically known, so the
// page shell doesn't depend on dynamic params. In development this does not
// pre-fill the cache.
export function generateStaticParams() {
  return [{ slug: 'cold-badge' }, { slug: 'purged' }]
}

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

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  return (
    <main>
      <Suspense fallback={<p id="loading">Loading...</p>}>
        <CachedValue slug={slug} />
      </Suspense>
    </main>
  )
}
