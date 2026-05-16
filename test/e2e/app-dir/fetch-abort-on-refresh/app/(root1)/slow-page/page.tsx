import { connection } from 'next/server'
import { Suspense } from 'react'

async function SlowData() {
  // Artificial delay to simulate slow RSC fetch
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 5_000))
  return (
    <div
      id="slow-data-loaded"
      style={{ padding: '10px', background: '#e0e0ff' }}
    >
      Slow data loaded successfully!
    </div>
  )
}

export default function SlowPage() {
  return (
    <div id="slow-page">
      <Suspense
        fallback={<div id="loading-slow-data">Loading slow data...</div>}
      >
        <SlowData />
      </Suspense>
    </div>
  )
}
