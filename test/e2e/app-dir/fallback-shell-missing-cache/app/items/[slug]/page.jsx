import { connection } from 'next/server'
import { Suspense } from 'react'

async function DynamicContent() {
  await connection()
  return <p id="content">dynamic content</p>
}

export default function ItemPage() {
  return (
    <Suspense fallback={<p id="fallback">loading...</p>}>
      <DynamicContent />
    </Suspense>
  )
}
