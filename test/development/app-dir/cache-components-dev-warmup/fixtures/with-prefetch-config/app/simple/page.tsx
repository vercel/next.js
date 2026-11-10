import { Suspense } from 'react'
import {
  CachedData,
  CachedFetch,
  SuccessiveCachedData,
  UncachedFetch,
} from '../data-fetching'

const CACHE_KEY = __dirname + '/__PAGE__'

export default async function Page() {
  return (
    <main>
      <h1>Warmup Dev Renders</h1>

      <CachedData label="page" cacheKey={CACHE_KEY} />
      <SuccessiveCachedData label="page" cacheKey={CACHE_KEY} />

      <CachedFetch label="page" cacheKey={CACHE_KEY} />

      <Suspense fallback="Loading uncached fetch...">
        <UncachedFetch label="page" cacheKey={CACHE_KEY} />
      </Suspense>
    </main>
  )
}
