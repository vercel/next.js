import { connection } from 'next/server'
import { Suspense } from 'react'

async function DynamicCurrentTime() {
  await connection()

  return <p id="current-time">{Date.now()}</p>
}

export default function CurrentTimePage() {
  return (
    <div>
      <h1>Current Time</h1>
      <Suspense fallback={null}>
        <DynamicCurrentTime />
      </Suspense>
    </div>
  )
}
