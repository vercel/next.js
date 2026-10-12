import { Suspense } from 'react'
import { connection } from 'next/server'
import Link from 'next/link'

async function DynamicData() {
  await connection()

  return <p data-testid="mpa-dynamic-content">Dynamic MPA data</p>
}

export default function MpaTargetPage() {
  return (
    <div>
      <h1 data-testid="mpa-target-title">MPA Target Page</h1>
      <p>This page lives under a different root layout.</p>
      <Suspense fallback={<p data-testid="mpa-dynamic-skeleton">Loading...</p>}>
        <DynamicData />
      </Suspense>
      <Link href="/">Back to home</Link>
    </div>
  )
}
