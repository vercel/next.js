import type { Instant } from 'next'
import assert from 'node:assert/strict'

export const unstable_instant: Instant = {
  level: 'experimental-error',
  unstable_samples: [
    {
      searchParams: {
        single: 'test',
        multiple: ['a', 'b'],
      },
    },
  ],
}
export const prefetch = 'allow-runtime'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>
}) {
  return (
    <main>
      <CachedChild searchParams={await searchParams} />
    </main>
  )
}

async function CachedChild({
  searchParams,
}: {
  searchParams: Record<string, string | string[]>
}) {
  'use cache'
  assert.equal(
    searchParams.single,
    'test',
    `Expected searchParams.single to be 'test', got '${searchParams.single}'`
  )
  assert.deepStrictEqual(
    searchParams.multiple,
    ['a', 'b'],
    `Unexpected value for 'multiple'`
  )
  return <div id="single">{searchParams.single}</div>
}
