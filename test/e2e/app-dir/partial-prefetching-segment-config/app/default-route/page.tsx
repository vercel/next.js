import { Suspense } from 'react'
import { connection } from 'next/server'

// No per-segment config. This is the control: with neither the global
// `partialPrefetching` flag nor a segment-level opt-in, a `prefetch={true}`
// link does a full prefetch that includes dynamic data.
export default function Page() {
  return (
    <main>
      <div id="static-content">Default static</div>
      <Suspense fallback={<div>Loading dynamic...</div>}>
        <Dynamic />
      </Suspense>
    </main>
  )
}

async function Dynamic() {
  await connection()
  return <div id="dynamic-content">Default dynamic</div>
}
