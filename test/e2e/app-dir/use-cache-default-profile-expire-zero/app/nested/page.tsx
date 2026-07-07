import { Suspense } from 'react'
import { cacheLife } from 'next/cache'

async function innerCache() {
  'use cache'
  cacheLife({ expire: 60 }) // short, under the prerenderable minimum
  return new Date().toISOString()
}

async function outerCache() {
  'use cache'
  // No explicit `cacheLife`. Normally a short-lived cache nested inside an
  // outer cache without an explicit `cacheLife` errors during prerendering,
  // because the outer is silently degraded to a dynamic hole. Here it must not:
  // this app's default profile is itself dynamic (`expire: 0`), so every cache
  // is omitted from prerenders by default and there is nothing to warn about.
  return innerCache()
}

async function NestedValue() {
  const value = await outerCache()
  return <p id="value">{value}</p>
}

export default function Page() {
  return (
    <Suspense fallback={<p id="fallback">Loading...</p>}>
      <NestedValue />
    </Suspense>
  )
}
