import { Suspense } from 'react'
import { connection } from 'next/server'

export const unstable_dynamicStaleTime = 60

async function Content() {
  await connection()
  return (
    <div id="dynamic-stale-60-content">Dynamic content (stale time 60s)</div>
  )
}

export default function Page() {
  return (
    <Suspense fallback="Loading...">
      <Content />
    </Suspense>
  )
}
