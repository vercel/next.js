import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'

export default async function Page() {
  const cachedTimestamp = await getCachedTimestamp()
  return (
    <main>
      <p id="cached-data">{cachedTimestamp}</p>

      <p id="render-id" suppressHydrationWarning>
        {Math.floor(performance.timeOrigin + performance.now())}
      </p>

      <Link
        href="/"
        // Avoid creating requests that interfere with act()
        prefetch={false}
      >
        Go back to index page
      </Link>

      <Suspense fallback={<div>Loading non-prerenderable data...</div>}>
        {(async () => {
          // Use cookies() after navigation() so that the page
          // doesn't require a runtime shell.
          await connection()
          return <p id="dynamic-data">Dynamic data</p>
        })()}
      </Suspense>
    </main>
  )
}

async function getCachedTimestamp() {
  'use cache'
  await new Promise((resolve) => setTimeout(resolve))
  return `cache-timestamp: ${Date.now()}`
}
