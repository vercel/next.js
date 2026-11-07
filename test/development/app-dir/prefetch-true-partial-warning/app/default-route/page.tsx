import { Suspense } from 'react'
import { connection } from 'next/server'

// No partial prefetching opt-in. Navigating here via a `prefetch={true}` link
// should emit the dev warning.
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
