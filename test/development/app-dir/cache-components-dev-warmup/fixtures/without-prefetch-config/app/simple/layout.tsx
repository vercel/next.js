import { Suspense } from 'react'
import { UncachedFetch, CachedFetch, CachedData } from '../data-fetching'

const CACHE_KEY = __dirname + '/__LAYOUT__'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <section>
        <h1>Layout</h1>
        <p>This data is from a layout</p>

        <CachedData label="layout" cacheKey={CACHE_KEY} />

        <CachedFetch label="layout" cacheKey={CACHE_KEY} />

        <Suspense fallback="Loading uncached fetch...">
          <UncachedFetch label="layout" cacheKey={CACHE_KEY} />
        </Suspense>
      </section>
    </>
  )
}
