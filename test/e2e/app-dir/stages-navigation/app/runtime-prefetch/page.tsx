import { cookies } from 'next/headers'
import { Suspense } from 'react'
import { unstable_navigation } from 'next/cache'

// Opt this route into runtime prefetching. When a link to this page becomes
// visible, the client issues a runtime prefetch — a 'prerender-runtime' work
// unit on the server — which, unlike a static prefetch, is allowed to read
// request data like cookies.
export const prefetch = 'partial'

// Sample cookie values used at build time to validate the runtime prefetch.
export const instant = {
  unstable_samples: [{ cookies: [{ name: 'testCookie', value: 'testValue' }] }],
}

export default function Page() {
  return (
    <main>
      <Suspense
        fallback={<div id="cookie-fallback">Loading cookie content...</div>}
      >
        <CookieContent />
      </Suspense>
    </main>
  )
}

// Reads cookies *above* the `await unstable_navigation()` gate. The
// cookie-derived content is included in a runtime prefetch, which proves the
// prefetch response contains runtime data — while the gated content below
// is excluded from it. (It's also absent from static prefetches, since a
// static prerender suspends at the cookies() read before reaching it.)
async function CookieContent() {
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get('testCookie')?.value ?? null
  return (
    <>
      <div id="cookie-value">{`Cookie: ${cookieValue}`}</div>
      <Suspense
        fallback={<div id="gated-fallback">Loading gated content...</div>}
      >
        <Gated />
      </Suspense>
    </>
  )
}

async function Gated() {
  // Everything below is deferred to the actual navigation instead of
  // rendering during a runtime prefetch. Runtime prefetches are rendered
  // per-user, per-link, so this is exactly the per-request rendering cost
  // that unstable_navigation() exists to save.
  await unstable_navigation()
  return <div id="gated-content">Runtime gated content</div>
}
