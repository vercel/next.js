import { lazy, Suspense } from 'react'
import { EagerClient } from './eager-client'

// Only reachable through an async import from a Server Component, so it must not be
// bundled into the chunks the page segment loads eagerly.
const LazyClient = lazy(() => import('./lazy-client'))

// `searchParams` is read here rather than in the page so that the route can still be
// prerendered with cache components enabled.
async function MaybeLazy({
  searchParams,
}: {
  searchParams: Promise<{ lazy?: string }>
}) {
  const { lazy: showLazy } = await searchParams
  return showLazy ? <LazyClient /> : null
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ lazy?: string }>
}) {
  return (
    <main>
      <p>hello world</p>
      <EagerClient />
      <Suspense fallback={null}>
        <MaybeLazy searchParams={searchParams} />
      </Suspense>
    </main>
  )
}
