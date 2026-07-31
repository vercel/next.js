import { cookies } from 'next/headers'
import { Suspense } from 'react'

// Opt this route into runtime prefetching, like /runtime-prefetch — but this
// page has no `await unstable_navigation()` gate. A runtime prefetch renders
// the entire page, so nothing is deferred to the navigation stage. The suite
// uses this to assert that the client records such an entry as
// navigation-complete: a later `prefetch="navigation"` link to this route
// must not issue a second, deeper prefetch.
export const prefetch = 'partial'

// Sample cookie values used at build time to validate the runtime prefetch.
export const instant = {
  unstable_samples: [{ cookies: [{ name: 'testCookie', value: 'testValue' }] }],
}

export default function Page() {
  return (
    <main>
      <Suspense
        fallback={
          <div id="ungated-cookie-fallback">Loading cookie content...</div>
        }
      >
        <CookieContent />
      </Suspense>
    </main>
  )
}

// Reads cookies, so the content only renders in a runtime prefetch (or a
// navigation) — never in a static prefetch. There's no gate below it: once
// the runtime prefetch completes, the whole page is in the cache.
async function CookieContent() {
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get('testCookie')?.value ?? null
  return <div id="ungated-cookie-value">{`Ungated cookie: ${cookieValue}`}</div>
}
