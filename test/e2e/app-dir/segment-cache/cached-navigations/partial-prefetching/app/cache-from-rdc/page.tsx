import { navigation } from 'next/cache'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { Suspense } from 'react'

export default async function Page() {
  const cachedTimestamp = await getCachedTimestamp()
  return (
    <main>
      <p id="cached-data">{cachedTimestamp}</p>

      <Link
        href="/"
        // Avoid creating requests that interfere with act()
        prefetch={false}
      >
        Go back to index page
      </Link>

      <Suspense fallback={<div>Loading runtime data...</div>}>
        {(async () => {
          // Use cookies() after navigation() so that the page
          // doesn't require a runtime shell.
          await navigation()
          await cookies()
          return <p id="runtime-data">Navigation-only runtime data</p>
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
