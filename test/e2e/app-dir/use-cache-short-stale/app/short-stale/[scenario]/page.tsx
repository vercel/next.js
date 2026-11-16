import { randomUUID } from 'node:crypto'
import { cacheLife, cacheTag } from 'next/cache'
import { Suspense } from 'react'

export function generateStaticParams() {
  return [{ scenario: 'tag' }, { scenario: 'time' }]
}

async function CachedValue({ scenario }: { scenario: string }) {
  'use cache: remote'
  cacheLife({
    stale: 0,
    revalidate: scenario === 'time' ? 2 : 120,
    expire: 300,
  })
  cacheTag(`use-cache-short-stale:${scenario}`)
  return <p id="value">{randomUUID()}</p>
}

export default async function Page({
  params,
}: {
  params: Promise<{ scenario: string }>
}) {
  const { scenario } = await params

  return (
    <Suspense fallback={<p>Loading...</p>}>
      <CachedValue scenario={scenario} />
    </Suspense>
  )
}
