import { Suspense } from 'react'
import { connection } from 'next/server'

async function DynamicContent() {
  await connection()
  // Delay so that the streamed body has not arrived by the time the
  // bootstrap script reads PerformanceNavigationTiming.transferSize.
  await new Promise((resolve) => setTimeout(resolve, 500))
  return <p id="dynamic-content">Dynamic content</p>
}

export default function Page() {
  return (
    <main>
      <h1>Streaming page</h1>
      <Suspense fallback={<p id="dynamic-fallback">Loading...</p>}>
        <DynamicContent />
      </Suspense>
    </main>
  )
}
