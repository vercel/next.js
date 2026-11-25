import { Suspense } from 'react'
import { setTimeout } from 'timers/promises'

async function getCachedValue(slug: string) {
  'use cache'

  // A slow generation, so a warm reload that serves the cached entry is
  // observably faster than a cold load that has to generate, and so a cold read
  // is still pending at a staged-render boundary (which surfaces the cold cache
  // indicator). The slug keys the entry; the value itself is just a timestamp.
  await setTimeout(1000)

  return new Date().toISOString()
}

async function CachedValue({ slug }: { slug: string }) {
  const value = await getCachedValue(slug)

  return <p id="value">{value}</p>
}

export async function PageForSlug({ slug }: { slug: string }) {
  // NOTE: we're not using generateStaticParams because
  // those resolve after the shell in `partialPrefetching`,
  // and the test needs the cache to be part of the shell
  return (
    <main>
      <Suspense fallback={<p id="loading">Loading...</p>}>
        <CachedValue slug={slug} />
      </Suspense>
    </main>
  )
}
