import { Suspense } from 'react'
import { connection } from 'next/server'

export const unstable_instant = false

async function DynamicContent() {
  await connection()
  return (
    <div>
      <h1>Suspense with null fallback</h1>
      <p>Dynamic content (rendered at request time)</p>
    </div>
  )
}

// This uses the old pattern for fully dynamic routes: Suspense with a null
// fallback around the entire body. This produces no static HTML shell but
// should still allow the static generation result (segment data, route tree)
// to be cached rather than re-computed on every request.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <DynamicContent />
    </Suspense>
  )
}
