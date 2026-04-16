import type { Instant } from 'next'
import assert from 'node:assert/strict'

export const unstable_instant: Instant = {
  prefetch: 'runtime',
  samples: [{ params: { slug: 'hello' } }],
}
export const unstable_prefetch = 'runtime'

export default async function Page({
  params,
}: {
  params: Promise<Record<string, string>>
}) {
  return (
    <main>
      <CachedChild params={await params} />
    </main>
  )
}

async function CachedChild({ params }: { params: Record<string, string> }) {
  'use cache'
  assert.equal(
    params.slug,
    'hello',
    `Expected params.slug to be 'hello', got '${params.slug}'`
  )
  assert.deepStrictEqual(Object.keys(params), ['slug'])

  return <div id="slug">{params.slug}</div>
}
