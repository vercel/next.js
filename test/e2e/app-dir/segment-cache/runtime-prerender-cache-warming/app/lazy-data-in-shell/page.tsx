import {
  unstable_prefetch as prefetch,
  unstable_navigation as navigation,
} from 'next/cache'
import { cookies } from 'next/headers'
import { Suspense } from 'react'

export default async function Page() {
  await cookies() // Avoid static prerendering
  return (
    <main>
      <h1>This page gates caches behind prefetch and navigation.</h1>
      <Suspense fallback={<p>Loading prefetch data...</p>}>
        <PrefetchData />
      </Suspense>
      <Suspense fallback={<p>Loading navigation data...</p>}>
        <NavigationData />
      </Suspense>
    </main>
  )
}

async function PrefetchData() {
  await prefetch()
  await cachedFn('after prefetch')
  return <p>Prefetch data</p>
}

async function NavigationData() {
  await navigation()
  await cachedFn('after navigation')
  return <p>Navigation data</p>
}

async function cachedFn(key: string) {
  'use cache'
  console.log('cachedFn :: ' + key)
}
