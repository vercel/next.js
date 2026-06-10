import { cacheLife } from 'next/cache'
import { Suspense } from 'react'

async function ShortLivedData() {
  'use cache'
  cacheLife('seconds')
  await new Promise((resolve) => setTimeout(resolve, 100))
  return <p id="short-lived">{Math.random()}</p>
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <ShortLivedData />
    </Suspense>
  )
}
