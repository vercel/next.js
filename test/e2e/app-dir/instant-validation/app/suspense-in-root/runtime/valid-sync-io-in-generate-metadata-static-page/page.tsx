import { cookies } from 'next/headers'
import { Suspense } from 'react'

// this page is NOT runtime-prefetchable,
// so Sync IO in generateMetadata should be allowed.
export const unstable_instant = { prefetch: 'static' }

export async function generateMetadata() {
  await cookies()
  const now = Date.now()
  return {
    title: `Sync IO in metadata: ${now}`,
  }
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
