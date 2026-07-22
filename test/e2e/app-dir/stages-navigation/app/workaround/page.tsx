import { cookies } from 'next/headers'
import { Suspense } from 'react'
import { unstable_navigation } from 'next/cache'

// Opt this route into runtime prefetching. unstable_navigation() only has an
// observable effect during runtime prefetches (it's a no-op during static
// prerendering), so the route must be runtime-prefetch-enabled for the
// exclusion to be testable.
export const prefetch = 'partial'

// Sample cookie values used at build time to validate the runtime prefetch.
export const instant = {
  unstable_samples: [{ cookies: [{ name: 'testCookie', value: 'testValue' }] }],
}

// This page demonstrates the canonical pattern for combining
// unstable_navigation() with "use cache". Awaiting unstable_navigation()
// inside a cache scope is an error, so keep the unstable_navigation() gate in
// an uncached wrapper and put the "use cache" directive on inner functions
// called below the gate. Cached content that isn't behind the gate is still
// included in runtime prefetches.
export default function Page() {
  return (
    <main>
      <Suspense
        fallback={<div id="cookie-fallback">Loading cookie content...</div>}
      >
        <CookieSection />
      </Suspense>
    </main>
  )
}

// Reads cookies above the `await unstable_navigation()` gate, so a runtime
// prefetch of this page actually renders runtime content. Everything below is
// nested under the cookie read, so none of it can appear in a static prefetch
// (a static prerender suspends at cookies() before reaching it) — which lets
// the test assert unambiguously on the runtime prefetch response.
async function CookieSection() {
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get('testCookie')?.value ?? null
  return (
    <>
      <div id="cookie-value">{`Workaround cookie: ${cookieValue}`}</div>
      <Suspense
        fallback={<div id="visible-fallback">Loading cached visible...</div>}
      >
        <CachedVisible />
      </Suspense>
      <Suspense fallback={<div id="gated-fallback">Loading gated...</div>}>
        <GatedSection />
      </Suspense>
    </>
  )
}

// Cached, not gated: included in runtime prefetches.
async function CachedVisible() {
  'use cache'
  return <div id="cached-visible">Cached visible content</div>
}

// Uncached wrapper: gate first, then read the cached data. Only this subtree
// is excluded from the runtime prefetch and deferred to the navigation.
async function GatedSection() {
  await unstable_navigation()
  const data = await getWorkaroundData()
  return <div id="gated-data">{data}</div>
}

async function getWorkaroundData() {
  'use cache'
  return 'Cached workaround data'
}
