import { Suspense } from 'react'
import { connection } from 'next/server'
import { RevalidateButton } from './revalidate-button'
import { fetchRandomWithForceCache } from '../../utils'

async function DynamicContent() {
  // Make the page dynamic/PPR by accessing connection()
  await connection()
  // Generate uncached value after dynamic access
  const uncachedValue = Math.random()
  return <p id="uncached-value">{uncachedValue}</p>
}

export default async function Page() {
  // Use fetch with cache and tags
  const cachedValue = await fetchRandomWithForceCache({
    tag: 'revalidate-fetch-action-test',
  }).then(async (res) => `fetch-random-${await res.text()}`)

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
