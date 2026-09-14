import { Suspense } from 'react'
import { connection } from 'next/server'

export const unstable_dynamicStaleTime = 60

async function Content() {
  await connection()
  return <div id="slot-a-content">Slot A content (stale time 60s)</div>
}

export default function Page() {
  return (
    <Suspense fallback="Loading slot A...">
      <Content />
    </Suspense>
  )
}
