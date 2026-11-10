import { Suspense } from 'react'
import { CachedData, UncachedFetch } from '../data-fetching'
import { PrivateCachedData, SuccessivePrivateCachedData } from './data-fetching'

const CACHE_KEY = '/private-cache/__PAGE__'

export default async function Page() {
  return (
    <main>
      <h1>Warmup Dev Renders - private cache</h1>

      <CachedData label="page" cacheKey={CACHE_KEY} />

      <Suspense fallback="Loading private cache...">
        <PrivateCachedData label="page" cacheKey={CACHE_KEY} />
      </Suspense>

      <Suspense fallback="Loading two successive private caches...">
        <SuccessivePrivateCachedData label="page" cacheKey={CACHE_KEY} />
      </Suspense>

      <Suspense fallback="Loading uncached fetch...">
        <UncachedFetch label="page" cacheKey={CACHE_KEY} />
      </Suspense>
    </main>
  )
}
