import { connection } from 'next/server'
import { Suspense } from 'react'

async function Hang() {
  await connection()
  await new Promise(() => {})
  return null
}

export default function Page() {
  return (
    <Suspense fallback={<p>stream-started</p>}>
      <Hang />
    </Suspense>
  )
}
