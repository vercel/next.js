import { cookies } from 'next/headers'
import { Suspense } from 'react'

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{ cookies: [] }],
}

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
