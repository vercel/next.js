import { Suspense } from 'react'
import { connection } from 'next/server'

// Opts into partial prefetching at the segment level. Navigating here via a
// `prefetch={true}` link should NOT warn.
export const prefetch = 'partial'

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
