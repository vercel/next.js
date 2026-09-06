import { Suspense } from 'react'
import { connection } from 'next/server'

// A page whose only non-static data source is `connection()`. Unlike cookies
// or searchParams, `connection()` is *dynamic* data: it hangs during runtime
// prerenders too, and its hole can only be filled by the navigation-time
// dynamic request. It is therefore NOT recorded as a runtime-data access:
// the route tree prefetch carries the static-prefetch hint, and the static
// per-segment response — although partial — is sufficient (a runtime
// prefetch would have the exact same hole), so no runtime fallback should
// fire.

async function DynamicContent() {
  await connection()
  return <div id="connection-content">Connection content</div>
}

export default function Page() {
  return (
    <main>
      <p id="page-content">Connection page shell text</p>
      <Suspense
        fallback={<p id="connection-loading">Loading connection content...</p>}
      >
        <DynamicContent />
      </Suspense>
    </main>
  )
}
