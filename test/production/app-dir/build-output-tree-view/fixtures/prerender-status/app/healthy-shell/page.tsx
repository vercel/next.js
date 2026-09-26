import { Suspense } from 'react'
import { connection } from 'next/server'

export async function generateMetadata() {
  await connection()
  return { title: 'Runtime metadata' }
}

async function RuntimeMarker() {
  await connection()
  return <span>Runtime content</span>
}

export default function HealthyShellPage() {
  return (
    <p>
      Healthy shell
      <Suspense fallback={<span>Loading runtime content</span>}>
        <RuntimeMarker />
      </Suspense>
    </p>
  )
}
