import { connection } from 'next/server'
import { cookies } from 'next/headers'
import { Suspense } from 'react'

type SearchParams = Record<string, string | string[]>

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const cachedTimestamp = await getCachedTimestamp()
  return (
    <main>
      <p>
        This page uses a cache that is included both in the HTML shell and in
        runtime shells/prefetches. The values should consistent everywhere
        thanks to the RDC.
      </p>
      <p id="cached-data">{cachedTimestamp}</p>
      <Suspense fallback={<div>Loading...</div>}>
        <Runtime searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<div>Loading dynamic data...</div>}>
        {connection().then(() => (
          <p id="dynamic-data">Dynamic data</p>
        ))}
      </Suspense>
    </main>
  )
}

async function Runtime({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  // Force the page to use a runtime shell/prefetch
  await cookies()
  return (
    <div>
      <p id="cookie-data">Cookie data</p>
      <Suspense fallback={<div>Loading...</div>}>
        {searchParams.then(() => (
          <p id="search-params-data">Search params data</p>
        ))}
      </Suspense>
    </div>
  )
}

async function getCachedTimestamp() {
  'use cache'
  await new Promise((resolve) => setTimeout(resolve))
  return `cache-timestamp: ${Date.now()}`
}
