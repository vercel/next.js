import { connection } from 'next/server'
import { Suspense } from 'react'

async function Boom() {
  await connection()
  throw new Error('server-side-error')
}

export default function Page() {
  return (
    <Suspense fallback={<p>error-pending</p>}>
      <Boom />
    </Suspense>
  )
}
