import { Suspense } from 'react'
import { connection } from 'next/server'

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <PageImpl />
    </Suspense>
  )
}

async function PageImpl() {
  await connection()
  throw new Error('server-side error inside air boundary')
}
