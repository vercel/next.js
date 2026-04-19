import { Suspense } from 'react'
import { connection } from 'next/server'

async function DynamicContent() {
  await connection()
  return <div data-testid="dynamic-content">Dynamic content</div>
}

export default function TargetPage() {
  return (
    <div data-testid="target-page">
      <h1>Target Page</h1>
      <div data-testid="static-content">This is static content</div>
      <Suspense fallback={<div data-testid="loading">Loading...</div>}>
        <DynamicContent />
      </Suspense>
    </div>
  )
}
