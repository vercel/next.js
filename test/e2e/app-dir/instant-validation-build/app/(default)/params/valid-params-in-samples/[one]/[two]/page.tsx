import type { Instant } from 'next'
import assert from 'node:assert/strict'

export const unstable_instant: Instant = {
  prefetch: 'runtime',
  samples: [
    {
      params: {
        one: '123',
        two: '456',
      },
    },
  ],
}
export const unstable_prefetch = 'runtime'

export default async function Page({
  params,
}: {
  params: Promise<Record<string, string>>
}) {
  return (
    <main>
      <p>
        When validated in build, the page should receive the params specified in
        the sample.
      </p>
      <TestParams params={params} />
    </main>
  )
}

async function TestParams({
  params,
}: {
  params: Promise<Record<string, string>>
}) {
  const p = await params
  const { one, two } = p

  assert.equal(one, '123', `Unexpected value for param 'one'`)
  assert.equal(two, '456', `Unexpected value for param 'two'`)
  assert.equal('three' in p, false)
  assert.equal(p.three, undefined)

  assert.deepStrictEqual(
    { ...p },
    { one: '123', two: '456' },
    `Unexpected value when iterating over params object`
  )

  return null
}
