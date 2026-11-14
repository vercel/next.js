import { Suspense } from 'react'
import { connection } from 'next/server'

async function SlowContent() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 500))
  return <p data-testid="slow-content-marker">slow-content-marker</p>
}

export default function Page() {
  return (
    <Suspense
      fallback={<p data-testid="slow-fallback-marker">slow-fallback-marker</p>}
    >
      <SlowContent />
    </Suspense>
  )
}
