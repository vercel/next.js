import type { Instant } from 'next'
import assert from 'node:assert/strict'

import { ClientChild } from './client'

export const unstable_instant: Instant = {
  prefetch: 'runtime',
  samples: [
    {
      searchParams: {
        single: 'test',
        multiple: ['a', 'b'],
      },
    },
  ],
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>
}) {
  return (
    <main>
      <TestSearchParams searchParams={searchParams} />
    </main>
  )
}

async function TestSearchParams({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>
}) {
  const sp = await searchParams
  assert.equal(
    sp.single,
    'test',
    `Expected 'single' to be 'test', got '${sp.single}'`
  )
  assert.deepStrictEqual(
    sp.multiple,
    ['a', 'b'],
    `Unexpected value for 'multiple'`
  )
  return <ClientChild searchParams={sp} />
}
