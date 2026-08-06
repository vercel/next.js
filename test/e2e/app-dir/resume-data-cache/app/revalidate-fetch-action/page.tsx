import { Suspense } from 'react'
import { connection } from 'next/server'
import { RevalidateButton } from './revalidate-button'

async function DynamicContent() {
  // Make the page dynamic/PPR by accessing connection()
  await connection()
  // Generate uncached value after dynamic access
  const uncachedValue = Math.random()
  return <p id="uncached-value">{uncachedValue}</p>
}

export default async function Page() {
  // Use fetch with cache and tags
  const cachedValue = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    { cache: 'force-cache', next: { tags: ['revalidate-fetch-action-test'] } }
  ).then((res) => res.text())

  return (
    <div>
      <p id="cached-value">{cachedValue}</p>
      <Suspense fallback={<p id="uncached-value">Loading...</p>}>
        <DynamicContent />
      </Suspense>
      <RevalidateButton />
    </div>
  )
}
