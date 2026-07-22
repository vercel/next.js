import { Suspense } from 'react'
import { unstable_navigation } from 'next/cache'

export default function Page() {
  return (
    <main>
      <div id="above-navigation">Above navigation content</div>
      <Suspense
        fallback={<div id="below-fallback">Loading below navigation...</div>}
      >
        <BelowNavigation />
      </Suspense>
    </main>
  )
}

async function BelowNavigation() {
  // On a fully static page, `await unstable_navigation()` has no effect. It
  // only defers content during runtime prefetches, which are rendered
  // per-user, per-link. A static prerender is computed once and shared across
  // many clients, so there's no per-request cost to save — this content is
  // included in the static output (and thus in static prefetches).
  await unstable_navigation()
  return <div id="below-navigation">Below navigation content</div>
}
