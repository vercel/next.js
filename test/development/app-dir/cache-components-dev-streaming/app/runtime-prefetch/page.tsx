import { connection } from 'next/server'
import { cookies } from 'next/headers'
import { Suspense } from 'react'
import { setTimeout } from 'timers/promises'

export const prefetch = 'allow-runtime'

async function RuntimePrefetchable() {
  await cookies()
  return <p id="runtime">runtime content</p>
}

async function Dynamic() {
  await connection()
  await setTimeout(1000)
  return <p id="dynamic">dynamic content</p>
}

export default function Page() {
  return (
    <main>
      <Suspense fallback={<p id="runtime-fallback">Loading runtime...</p>}>
        <RuntimePrefetchable />
      </Suspense>
      <Suspense fallback={<p id="dynamic-fallback">Loading dynamic...</p>}>
        <Dynamic />
      </Suspense>
    </main>
  )
}
