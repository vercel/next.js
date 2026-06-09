import { cookies } from 'next/headers'
import { Suspense } from 'react'

export const unstable_instant = { level: 'experimental-error' }
export const prefetch = 'allow-runtime'

async function Runtime() {
  await cookies()
  return <p>Runtime content</p>
}

export default function Page() {
  return (
    <main>
      <Suspense fallback={<p>Loading...</p>}>
        <Runtime />
      </Suspense>
    </main>
  )
}
