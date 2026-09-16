// A page that calls cookies and headers, but doesn't await them during the prerender,
// which means it can still be prefetched statically.
//
// Note the Shell phase is always permitted to issue a runtime shell request,
// so the absence of one in the test is attributable to the static shell
// attempt succeeding, not to configuration forbidding runtime requests.

import { cacheLife } from 'next/dist/server/use-cache/cache-life'
import { cookies, headers } from 'next/headers'
import { connection } from 'next/server'
import { Suspense } from 'react'

export default async function Page() {
  return (
    <main>
      <p id="page-content">Runtime APIs called but not awaited</p>
      <Suspense
        fallback={<p id="dynamic-loading">Loading dynamic content...</p>}
      >
        <Dynamic />
      </Suspense>
    </main>
  )
}

async function Dynamic() {
  const cookiesPromise = cookies()
  const headersPromise = headers()
  const cachePromise = shortStaleCache()

  // The prerender ends here, so it doesn't observe cookies/headers being awaited.
  await connection()

  await Promise.all([cookiesPromise, headersPromise, cachePromise])

  return <div id="dynamic-content">Dynamic content</div>
}

async function shortStaleCache() {
  'use cache'
  cacheLife({ stale: 300 - 1 }) // smaller than MIN_SHELL_STALE
  return Date.now()
}
