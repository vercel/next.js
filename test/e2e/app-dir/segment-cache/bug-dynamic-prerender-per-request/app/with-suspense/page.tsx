import { Suspense } from 'react'
import { connection } from 'next/server'

async function DynamicContent() {
  await connection()
  return <p>Dynamic content (rendered at request time)</p>
}

// connection() is inside a Suspense boundary, so the route gets a static
// shell at build time (partial prerender). At runtime, the static shell is
// served from cache and only the dynamic part is computed per-request.
// prerenderToStream should NOT run on each request for this route.
export default function Page() {
  return (
    <div>
      <h1>With Suspense</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <DynamicContent />
      </Suspense>
    </div>
  )
}
