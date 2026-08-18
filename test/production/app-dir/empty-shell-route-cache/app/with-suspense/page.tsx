import { Suspense } from 'react'
import { connection } from 'next/server'

async function DynamicContent() {
  await connection()
  return <p>Dynamic content rendered at request time</p>
}

export default function Page() {
  return (
    <div>
      <h1>With Suspense</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <DynamicContent />
      </Suspense>
    </div>
  )
}
