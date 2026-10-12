import { Suspense } from 'react'
import { CachedData, UncachedFetch } from '../data-fetching'
import { ShortStaleCache } from './data-fetching'

const CACHE_KEY = __dirname + '/__PAGE__'

export default async function Page() {
  return (
    <main>
      <h1>Warmup Dev Renders - short stale cache</h1>

      <CachedData label="page" cacheKey={CACHE_KEY} />

      <Suspense fallback="Loading short-stale cache...">
        <ShortStaleCache label="page" cacheKey={CACHE_KEY} />
      </Suspense>

      <Suspense fallback="Loading uncached fetch...">
        <UncachedFetch label="page" cacheKey={CACHE_KEY} />
      </Suspense>
    </main>
  )
}
