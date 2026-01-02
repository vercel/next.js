import { Suspense } from 'react'
import { connection } from 'next/server'

async function ServerErrorContent() {
  await connection()
  throw new Error('Test server error')
}

export default function ServerErrorPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ServerErrorContent />
    </Suspense>
  )
}
