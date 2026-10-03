import { connection } from 'next/server'
import { Suspense } from 'react'

async function DynamicContent() {
  if (!process.env.NEXT_TEST_OUTPUT_EXPORT) {
    await connection()
  }

  return <p>dynamic page</p>
}

export default function DynamicPage() {
  return (
    <Suspense fallback={<p>loading dynamic page</p>}>
      <DynamicContent />
    </Suspense>
  )
}
