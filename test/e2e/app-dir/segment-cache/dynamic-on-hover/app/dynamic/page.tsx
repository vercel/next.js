import { Suspense } from 'react'
import { connection } from 'next/server'

async function DynamicContent() {
  await connection()
  return <div id="dynamic-content">Dynamic content</div>
}

export default function Page() {
  return (
    <Suspense fallback={<div>Loading dynamic data...</div>}>
      <DynamicContent />
    </Suspense>
  )
}
