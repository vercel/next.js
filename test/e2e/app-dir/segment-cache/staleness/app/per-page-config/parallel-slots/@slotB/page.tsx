import { Suspense } from 'react'
import { connection } from 'next/server'

export const unstable_dynamicStaleTime = 15

async function Content() {
  await connection()
  return <div id="slot-b-content">Slot B content (stale time 15s)</div>
}

export default function Page() {
  return (
    <Suspense fallback="Loading slot B...">
      <Content />
    </Suspense>
  )
}
