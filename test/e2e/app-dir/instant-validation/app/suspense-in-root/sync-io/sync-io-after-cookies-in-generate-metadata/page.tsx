import { cookies } from 'next/headers'
import { Suspense } from 'react'

export const instant = { level: 'experimental-error' }

export async function generateMetadata() {
  await cookies()
  const now = Date.now()
  return {
    title: `Sync IO in metadata: ${now}`,
  }
}

async function SessionData() {
  await cookies()
  return <p>Session data</p>
}

export default function Page() {
  return (
    <main>
      <Suspense fallback={<p>Loading...</p>}>
        <SessionData />
      </Suspense>
    </main>
  )
}
