import { connection } from 'next/server'
import { Suspense } from 'react'

export const unstable_instant = { prefetch: 'static' }

export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <main>
        <p>
          The page blocks on dynamic content, but shows a fallback, so it's
          instant
        </p>
        <Dynamic />
      </main>
    </Suspense>
  )
}

async function Dynamic() {
  await connection()
  return 'Dynamic content from page'
}
