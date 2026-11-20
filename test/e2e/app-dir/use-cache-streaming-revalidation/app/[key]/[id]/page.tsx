import { randomUUID } from 'node:crypto'
import { Suspense } from 'react'
import { cacheLife } from 'next/cache'

type Props = { params: Promise<{ key: string; id: string }> }

async function getValue(key: string) {
  'use cache: remote'
  // Keep the entry fresh through its five-second generation and initial
  // cache-hit check.
  cacheLife({ stale: 0, revalidate: 10, expire: 3600 })

  // The verification request can resume an instance paused after the previous
  // response. A single overdue timer could then finish regeneration before the
  // cache read. This loop schedules new timers after resumption, so that read
  // can still observe the stale value.
  for (let step = 0; step < 10; step++) {
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return `${key}:${randomUUID()}`
}

async function Shell({ params }: Props) {
  const { id } = await params
  return <p>Request: {id}</p>
}

async function Value({ params }: Props) {
  const { key } = await params
  // The shell starts streaming before this read starts background regeneration.
  await new Promise((resolve) => setTimeout(resolve, 250))
  return <p id="value">{await getValue(key)}</p>
}

export default function Page({ params }: Props) {
  return (
    <main>
      <Suspense fallback={<p>Loading request</p>}>
        <Shell params={params} />
      </Suspense>
      <Suspense fallback={<p>Loading value</p>}>
        <Value params={params} />
      </Suspense>
    </main>
  )
}
