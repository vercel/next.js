import { Suspense } from 'react'
import { connection } from 'next/server'

export default function Page() {
  return (
    <Suspense>
      <PageImpl />
    </Suspense>
  )
}

let hasThrown = false

async function PageImpl() {
  // Throw only during the runtime
  await connection()

  if (!hasThrown) {
    hasThrown = true
    throw new Error('this is a test')
  }

  return <p id="recover">Recovered</p>
}
