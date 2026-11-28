import { Suspense } from 'react'
import { connection } from 'next/server'

async function Dynamic() {
  await connection()
  return <p>Dynamic</p>
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <Dynamic />
    </Suspense>
  )
}
