import { Suspense } from 'react'
import { connection } from 'next/server'

async function ConnectionContent() {
  await connection()

  return <h1>connected</h1>
}

export default function ConnectionPage() {
  return (
    <Suspense fallback={<p>loading</p>}>
      <ConnectionContent />
    </Suspense>
  )
}
