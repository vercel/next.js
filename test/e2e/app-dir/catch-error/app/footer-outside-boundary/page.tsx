import { Suspense } from 'react'
import { connection } from 'next/server'

export default function Page() {
  return (
    <Suspense>
      <PageImpl />
    </Suspense>
  )
}

async function PageImpl() {
  // connection() opts out of pre-rendering, ensuring the error occurs at
  // server runtime (per-request RSC render), not during static pre-render.
  await connection()
  throw new Error('server error inside boundary')
}
