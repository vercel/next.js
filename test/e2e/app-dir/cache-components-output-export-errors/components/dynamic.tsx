import { connection } from 'next/server'
import { Suspense } from 'react'

async function DynamicContent() {
  await connection()
  return <p>Server work</p>
}

export default function DynamicPage() {
  return (
    <Suspense fallback={<p>Loading server work...</p>}>
      <DynamicContent />
    </Suspense>
  )
}
