import { Suspense } from 'react'
import { connection } from 'next/server'

// Explicitly opts out of partial prefetching via `instant = false`. This is the
// API for silencing the warning, so navigating here via a `prefetch={true}`
// link should NOT warn even though there's no partial prefetching opt-in.
export const instant = false

export default function Page() {
  return (
    <main>
      <div id="static-content">Instant-false static</div>
      <Suspense fallback={<div>Loading dynamic...</div>}>
        <Dynamic />
      </Suspense>
    </main>
  )
}

async function Dynamic() {
  await connection()
  return <div id="dynamic-content">Instant-false dynamic</div>
}
