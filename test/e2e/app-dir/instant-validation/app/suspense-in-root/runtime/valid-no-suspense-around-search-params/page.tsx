import { connection } from 'next/server'
import { Suspense } from 'react'

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{ cookies: [] }],
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>
}) {
  const search = await searchParams
  return (
    <main>
      <div>
        <p>Params don't need a suspense boundary when runtime-prefetched:</p>
        <div id="runtime-content">Search: {JSON.stringify(search)}</div>
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

async function Dynamic() {
  await connection()
  return <div id="dynamic-content">Dynamic content from page</div>
}
