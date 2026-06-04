import { Suspense } from 'react'
import { connection } from 'next/server'

async function DynamicContent() {
  await connection()
  return <div data-testid="dynamic-content">Dynamic content loaded</div>
}

export default function TargetPage() {
  return (
    <div>
      <h1 data-testid="target-title">Target Page</h1>
      <Suspense fallback={<div data-testid="loading-skeleton">Loading...</div>}>
        <DynamicContent />
      </Suspense>
    </div>
  )
}
