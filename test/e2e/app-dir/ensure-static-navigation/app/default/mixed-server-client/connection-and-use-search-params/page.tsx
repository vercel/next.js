import { connection } from 'next/server'
import { Suspense } from 'react'
import { ClientSearchQuery } from './client'

export const unstable_ensureStatic = 'navigation'

export default function Page() {
  return (
    <main>
      <Suspense fallback={<p>Loading...</p>}>
        <ClientSearchQuery />
      </Suspense>
      <Suspense fallback={<p>Loading...</p>}>
        <Inner />
      </Suspense>
    </main>
  )
}

async function Inner() {
  await connection()
  return <p>Dynamic data</p>
}
