import { Suspense } from 'react'
import { connection } from 'next/server'

// Only `instant = true` — no `prefetch` export. `instant` alone does not opt
// the route into Partial Prefetching, so a <Link prefetch={true}> to this page
// still performs a full prefetch that includes dynamic content.
export const instant = true

export default async function Page() {
  return (
    <main>
      <Suspense fallback={<div>Loading cached...</div>}>
        <Cached />
      </Suspense>
      <Suspense fallback={<div>Loading dynamic...</div>}>
        <Dynamic />
      </Suspense>
    </main>
  )
}

async function Cached() {
  'use cache'
  return <div id="cached-content">Cached content</div>
}

async function Dynamic() {
  await connection()
  return <div id="dynamic-content">Dynamic content</div>
}
