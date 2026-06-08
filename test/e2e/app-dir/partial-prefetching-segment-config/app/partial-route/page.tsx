import { Suspense } from 'react'
import { connection } from 'next/server'

// Opts this route into partial prefetching at the segment level, without the
// global `partialPrefetching` flag. A `prefetch={true}` link should prefetch
// the static shell but never the dynamic data.
export const unstable_prefetch = 'partial'

export default function Page() {
  return (
    <main>
      <div id="static-content">Partial static</div>
      <Suspense fallback={<div>Loading dynamic...</div>}>
        <Dynamic />
      </Suspense>
    </main>
  )
}

async function Dynamic() {
  await connection()
  return <div id="dynamic-content">Partial dynamic</div>
}
