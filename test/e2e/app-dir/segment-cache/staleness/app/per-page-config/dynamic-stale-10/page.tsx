import { Suspense } from 'react'
import { connection } from 'next/server'

export const unstable_dynamicStaleTime = 10

async function Content() {
  await connection()
  return (
    <div id="dynamic-stale-10-content">Dynamic content (stale time 10s)</div>
  )
}

export default function Page() {
  return (
    <Suspense fallback="Loading...">
      <Content />
    </Suspense>
  )
}
