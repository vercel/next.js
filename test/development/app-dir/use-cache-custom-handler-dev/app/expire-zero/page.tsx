import { Suspense } from 'react'
import { setTimeout } from 'timers/promises'
import { cacheLife } from 'next/cache'

// A public `'use cache'` routed through the custom (slow) handler, with an
// explicit short `expire`. In dev the built-in front handler applies a minimum
// retention, so a cache hit still resolves from the front in a microtask
// instead of paying the backing's latency on every read.
async function getCachedValue() {
  'use cache'
  // `expire: 0` gives a short, dynamic (client-only) cache life, excluded from
  // static prerenders. Reusing it across client navigations would require
  // opting the route into runtime prefetching (`prefetch = 'allow-runtime'`) so
  // Cached Navigations embeds it into the client router cache; this fixture
  // doesn't, since the test only exercises the dev front handler serving it
  // warm on reloads.
  cacheLife({ expire: 0 })
  await setTimeout(1000)
  return new Date().toISOString()
}

async function CachedValue() {
  const value = await getCachedValue()

  return <p id="value">{value}</p>
}

export default function Page() {
  return (
    <main>
      <Suspense fallback={<p id="loading">Loading...</p>}>
        <CachedValue />
      </Suspense>
    </main>
  )
}
