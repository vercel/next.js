import { connection } from 'next/server'
import { Suspense, Fragment } from 'react'

export const instant = {
  level: 'experimental-error',
  unstable_samples: [{ cookies: [], searchParams: { foo: 'bar' } }],
}
export const prefetch = 'allow-runtime'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>
}) {
  return (
    <main>
      <div>
        <p>Params don't need a suspense boundary when runtime-prefetched:</p>
        <SuspenseInPartialPrefetching>
          <LinkData searchParams={searchParams} />
        </SuspenseInPartialPrefetching>
      </div>

      <div>
        <p>But dynamic content does:</p>
        <Suspense fallback={<div>Loading...</div>}>
          <Dynamic />
        </Suspense>
      </div>
    </main>
  )
}

const SuspenseInPartialPrefetching = process.env.__NEXT_PARTIAL_PREFETCHING
  ? Suspense
  : Fragment

async function LinkData({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>
}) {
  const search = await searchParams
  return <div id="runtime-content">Search: {JSON.stringify(search)}</div>
}

async function Dynamic() {
  await connection()
  return <div id="dynamic-content">Dynamic content from page</div>
}
