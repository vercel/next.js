import { Suspense } from 'react'
import { connection } from 'next/server'
import { Thrower } from './thrower'

export default function Page() {
  return (
    <Suspense>
      <PageImpl />
    </Suspense>
  )
}

let hasThrown = false

async function PageImpl() {
  await connection()

  if (!hasThrown) {
    hasThrown = true
    return <Thrower shouldThrow={true} />
  }

  return <Thrower shouldThrow={false} />
}
