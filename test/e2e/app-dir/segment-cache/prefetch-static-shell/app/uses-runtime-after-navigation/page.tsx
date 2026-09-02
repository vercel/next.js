// A page that calls cookies and headers, but only after awaiting `navigation()`
// which means it can still be prefetched statically.
//
// Note the Shell phase is always permitted to issue a runtime shell request,
// so the absence of one in the test is attributable to the static shell
// attempt succeeding, not to configuration forbidding runtime requests.

import { cacheLife } from 'next/dist/server/use-cache/cache-life'
import { cookies, headers } from 'next/headers'
import { unstable_navigation as navigation } from 'next/cache'
import { Suspense } from 'react'

export default async function Page() {
  return (
    <main>
      <p id="page-content">Runtime APIs called after navigation()</p>
      <Suspense
        fallback={<p id="navigation-loading">Loading navigation content...</p>}
      >
        <Navigation />
      </Suspense>
    </main>
  )
}

async function Navigation() {
  // The runtime data tracking should end here, so the prerender
  // shouldn't track the awaits of cookies/headers inside DynamicContent.
  await navigation()

  return (
    <>
      <div id="navigation-content">Navigation content</div>
      <Suspense
        fallback={<p id="dynamic-loading">Loading dynamic content...</p>}
      >
        <DynamicContent />
      </Suspense>
    </>
  )
}

async function shortStaleCache() {
  'use cache'
  cacheLife({ stale: 300 - 1 }) // smaller than MIN_SHELL_STALE
  return Date.now()
}

async function DynamicContent() {
  await Promise.all([cookies(), headers(), shortStaleCache()])
  return <p id="dynamic-content">Dynamic content</p>
}
