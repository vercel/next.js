import type { Instant } from 'next'
import assert from 'node:assert/strict'

import { Suspense } from 'react'

export const unstable_instant: Instant = {
  prefetch: 'static',
  samples: [
    {
      params: {
        one: '123',
        // two: <missing>
      },
    },
  ],
}

export default async function Page({
  params,
}: {
  params: Promise<Record<string, string>>
}) {
  return (
    <main>
      <p>
        This page reads a param that is not declared in the sample, so it should
        fail validation with an exhaustiveness error.
      </p>
      <Suspense fallback={<div>Loading...</div>}>
        <TestParams params={params} />
      </Suspense>
    </main>
  )
}

async function TestParams({
  params,
}: {
  params: Promise<Record<string, string>>
}) {
  const p = await params

  assert.equal(p.one, '123', `Unexpected value for param 'one'`)
  // TODO(instant-validation-build): this should throw and abort
  assert.equal(p.two, undefined, `Unexpected value for param 'two'`)

  // TODO: test `in` and iteration
  // assert.deepStrictEqual(
  //   { ...p },
  //   { one: '123', two: '456' },
  //   `Unexpected value when iterating over params object`
  // )

  return null
}
