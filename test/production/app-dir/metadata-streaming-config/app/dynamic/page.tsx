import { Suspense } from 'react'
import { connection } from 'next/server'

async function DynamicContent() {
  await connection()
  return <p>dynamic</p>
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <DynamicContent />
    </Suspense>
  )
}
