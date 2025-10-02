import { Suspense } from 'react'
import { CachedData, CachedFetch, UncachedFetch } from '../data-fetching'

const CACHE_KEY = __dirname + '/__PAGE__'

export default async function Page() {
  return (
    <main>
      <h1>Warmup Dev Renders</h1>
      <p>
        In Dev when cacheComponents is enabled requests are preceded by a cache
        warming prerender. Without PPR this prerender only includes up to the
        nearest Loading boundary (loading.tsx) and will never include the Page
        itself. When PPR is enabled it will include everything that is
        prerenderable including the page if appropriate.
      </p>

      <CachedData label="page" cacheKey={CACHE_KEY} />

      <CachedFetch label="page" cacheKey={CACHE_KEY} />

      <Suspense fallback="Loading uncached fetch...">
        <UncachedFetch label="page" cacheKey={CACHE_KEY} />
      </Suspense>
    </main>
  )
}
