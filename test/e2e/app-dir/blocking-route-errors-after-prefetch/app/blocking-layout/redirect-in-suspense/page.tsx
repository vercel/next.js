import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'

async function Redirect(): Promise<never> {
  await connection()
  redirect('/destination')
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Redirect />
    </Suspense>
  )
}
