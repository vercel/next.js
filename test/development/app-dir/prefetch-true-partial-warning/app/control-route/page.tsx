import { Suspense } from 'react'
import { connection } from 'next/server'

// No partial prefetching opt-in, same as /default-route. The difference is the
// link to this route uses the default prefetch (not `prefetch={true}`), so the
// warning should NOT fire even though the route hasn't opted in.
export default function Page() {
  return (
    <main>
      <div id="static-content">Control static</div>
      <Suspense fallback={<div>Loading dynamic...</div>}>
        <Dynamic />
      </Suspense>
    </main>
  )
}

async function Dynamic() {
  await connection()
  return <div id="dynamic-content">Control dynamic</div>
}
