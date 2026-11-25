import { Suspense } from 'react'
import { connection } from 'next/server'

async function DynamicContent() {
  await connection()
  return <div id="target-dynamic">Dynamic content for /target</div>
}

export default function Page() {
  return (
    <>
      <h1 id="target-shell">Target page</h1>
      <Suspense fallback="Loading target...">
        <DynamicContent />
      </Suspense>
    </>
  )
}
