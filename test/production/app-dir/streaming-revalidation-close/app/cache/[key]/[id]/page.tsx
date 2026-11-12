import { randomUUID } from 'node:crypto'
import { Suspense } from 'react'
import { cacheLife, cacheTag } from 'next/cache'
import { getState, waitForGate } from '../../../../state.cjs'

type Props = { params: Promise<{ key: string; id: string }> }

async function getValue(key: string) {
  'use cache: remote'
  cacheLife({ stale: 0, revalidate: 1, expire: 3600 })
  cacheTag(key)
  getState().events.push('generation-started:' + key)
  await waitForGate('generation:' + key)
  getState().events.push('generation-finished:' + key)
  return `${key}:${randomUUID()}`
}

async function Shell({ params }: Props) {
  const { id } = await params
  return <p>Request: {id}</p>
}

async function Value({ params }: Props) {
  const { key } = await params
  await waitForGate('read:' + key)
  return <p id="value">{await getValue(key)}</p>
}

export default function Page({ params }: Props) {
  return (
    <>
      <Suspense fallback={<p>Loading request</p>}>
        <Shell params={params} />
      </Suspense>
      <Suspense fallback={<p>Loading value</p>}>
        <Value params={params} />
      </Suspense>
    </>
  )
}
