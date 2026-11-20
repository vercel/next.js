import { connection } from 'next/server'
import { Suspense } from 'react'

async function DynamicContent() {
  await connection()
  return <div id="slow-page-content">Slow page content</div>
}

export default function Page() {
  return (
    <Suspense fallback={<div id="slow-page-loading">Loading slow page...</div>}>
      <DynamicContent />
    </Suspense>
  )
}
