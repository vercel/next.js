import { connection } from 'next/server'
import { Suspense } from 'react'

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{ cookies: [] }],
}

export default async function Page({
  params,
}: {
  params: Promise<{ param: string }>
}) {
  return (
    <main>
      <div>
        <p>Params don't need a suspense boundary when runtime-prefetched:</p>
        <Runtime params={params} />
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

async function Runtime({ params }: { params: Promise<{ param: string }> }) {
  const { param } = await params
  return <div id="runtime-content">Param value: {param}</div>
}

async function Dynamic() {
  await connection()
  return <div id="dynamic-content">Dynamic content from page</div>
}
