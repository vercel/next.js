import { Suspense } from 'react'
import { UncachedFetch, CachedData } from '../data-fetching'
import { PrivateCachedData } from './data-fetching'

export const unstable_prefetch = { mode: 'runtime', samples: [{}] }

const CACHE_KEY = '/private-cache/__LAYOUT__'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <section>
        <h1>Layout</h1>
        <p>This data is from a layout</p>

        <CachedData label="layout" cacheKey={CACHE_KEY} />

        <Suspense fallback="Loading private cache...">
          <PrivateCachedData label="layout" cacheKey={CACHE_KEY} />
        </Suspense>

        <Suspense fallback="Loading uncached fetch...">
          <UncachedFetch label="layout" cacheKey={CACHE_KEY} />
        </Suspense>
      </section>
    </>
  )
}
