import { Suspense } from 'react'
import { cacheLife } from 'next/cache'
import { connection } from 'next/server'

async function Content({ hangingInput }: { hangingInput: Promise<any> }) {
  'use cache'
  await new Promise((resolve) => setTimeout(resolve, 0))

  // Make sure the hanging input does not get omitted from the key as unused
  // (this never actually runs)
  if (Math.random() < 0) {
    await hangingInput
  }

  cacheLife({ stale: 4 * 60, revalidate: 8 * 60 })
  return 'Content with stale time of 4 minutes'
}

export default function Page() {
  return (
    <>
      <p>
        This page includes a cache which has an unused hanging input. The
        hanging input will cause the cache key to only resolve at the end of the
        prerender, but the cache's stale-time should still contribute to the
        page segment's total stale-time.
      </p>
      <Suspense fallback="Loading...">
        <Content hangingInput={connection()} />
      </Suspense>
    </>
  )
}
