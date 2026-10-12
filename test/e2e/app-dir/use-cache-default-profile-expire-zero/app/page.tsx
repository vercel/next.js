import { Suspense } from 'react'

// A single, non-nested `'use cache'` with no inline `cacheLife()`. It inherits
// the app's `default` profile, which is configured with `expire: 0`. That must
// be treated exactly like an inline `cacheLife({ expire: 0 })`: a dynamic hole
// excluded from the prerender, not a nested-cache misconfiguration. There is no
// outer cache here, so the "nested inside another use cache" error must not
// fire.
async function CachedValue() {
  'use cache'
  return <p id="value">{new Date().toISOString()}</p>
}

export default function Page() {
  return (
    <Suspense fallback={<p id="fallback">Loading...</p>}>
      <CachedValue />
    </Suspense>
  )
}
