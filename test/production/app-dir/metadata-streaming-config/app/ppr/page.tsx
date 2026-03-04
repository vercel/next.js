import { Suspense } from 'react'
import { connection } from 'next/server'

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <DynamicContent />
    </Suspense>
  )
}

async function DynamicContent() {
  await connection()
  return <p>ppr</p>
}
