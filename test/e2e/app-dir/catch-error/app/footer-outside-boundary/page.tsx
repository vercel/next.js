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
  // connection() opts out of pre-rendering, ensuring the error occurs at
  // server runtime (per-request RSC render), not during static pre-render.
  await connection()

  if (!hasThrown) {
    hasThrown = true
    throw new Error('server error inside boundary')
  }

  return <p id="recover">Recovered</p>
}
