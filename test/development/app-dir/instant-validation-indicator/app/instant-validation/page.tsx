import Link from 'next/link'
import { Suspense } from 'react'
import { connection } from 'next/server'

export default function ValidationInstantPage() {
  return (
    <>
      <Suspense fallback={<p>Loading</p>}>
        <Slow />
      </Suspense>
      <Link href="/">Back home</Link>
    </>
  )
}

async function Slow() {
  await connection()
  await new Promise<void>((resolve) => setTimeout(resolve, 700))
  return <p>Validation complete</p>
}

export const unstable_instant = {
  prefetch: 'static',
}
