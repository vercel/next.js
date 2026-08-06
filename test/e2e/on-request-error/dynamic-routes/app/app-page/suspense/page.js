import { connection } from 'next/server'
import { Suspense } from 'react'

export default async function Page() {
  await connection()
  return (
    <Suspense>
      <Inner />
    </Suspense>
  )
}

function Inner() {
  if (typeof window === 'undefined') {
    throw new Error('server-suspense-page-node-error')
  }
  return 'inner'
}
