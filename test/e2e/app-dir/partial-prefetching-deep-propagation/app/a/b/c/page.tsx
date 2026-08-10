import { Suspense } from 'react'
import { connection } from 'next/server'

// Opt into Partial Prefetching on this deeply nested leaf page. The
// `SubtreeHasPartialPrefetching` hint originates here and must propagate up
// through the /a/b and /a layouts to the root for the scheduler to downgrade a
// `prefetch={true}` link into a partial (PPR) prefetch.
export const prefetch = 'partial'

export default function Page() {
  return (
    <main>
      <div id="static-content">Deep static</div>
      <Suspense fallback={<div>Loading dynamic...</div>}>
        <Dynamic />
      </Suspense>
    </main>
  )
}

async function Dynamic() {
  await connection()
  return <div id="dynamic-content">Deep dynamic</div>
}
