import type { Instant } from 'next'
import assert from 'node:assert/strict'

import { Suspense } from 'react'

export const unstable_instant: Instant = {
  prefetch: 'runtime',
  samples: [
    {
      searchParams: {
        // TODO(instant-validation-build): specify and test escaping behavior for spaces etc
        single: 'test',
        multiple: ['a', 'b'],
        missing: null,
      },
    },
  ],
}
export const unstable_prefetch = 'runtime'

type SearchParams = Record<string, string | string[]>

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ foo?: string | string[] }>
}) {
  return (
    <main>
      <p>
        When validated in build, the page should receive the search params
        specified in the sample.
      </p>
      <Suspense fallback={<div>Loading...</div>}>
        <TestSearchParams searchParams={searchParams} />
      </Suspense>
    </main>
  )
}

async function TestSearchParams({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const search = await searchParams

  assert.equal(
    search.single,
    'test',
    `Unexpected search param value for 'single'`
  )

  assert.deepStrictEqual(
    search.multiple,
    ['a', 'b'],
    `Unexpected search param value for 'multiple'`
  )

  assert.equal(
    search.missing,
    undefined,
    `search param 'missing' should not be defined`
  )
  assert.equal(
    'missing' in search,
    false,
    `search param 'missing' should not be in the keys of searchParams`
  )

  return null
}
