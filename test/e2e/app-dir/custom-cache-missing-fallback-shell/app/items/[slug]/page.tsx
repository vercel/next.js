import { connection } from 'next/server'
import { Suspense } from 'react'

async function Dynamic() {
  await connection()
  return <p>dynamic</p>
}

export default function ItemPage() {
  return (
    <Suspense fallback={<p>loading...</p>}>
      <Dynamic />
    </Suspense>
  )
}
