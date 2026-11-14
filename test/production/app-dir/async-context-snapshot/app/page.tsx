import { Suspense } from 'react'
import { connection } from 'next/server'

async function Dynamic() {
  await connection()
  return <p>hello world</p>
}

export default function Page() {
  return (
    <Suspense>
      <Dynamic />
    </Suspense>
  )
}
