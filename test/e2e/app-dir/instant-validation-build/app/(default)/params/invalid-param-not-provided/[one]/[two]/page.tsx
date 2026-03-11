import type { Instant } from 'next'
import assert from 'node:assert/strict'
import { ensureThrows } from '../../../../../../ensure-error'

export const unstable_instant: Instant = {
  prefetch: 'runtime',
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

  assert.equal(p.one, '123', `Unexpected value for param 'one'`)

  // We're allowed to access names that don't correspond to a param.
  assert.equal('three' in p, false)
  assert.equal(p.three, undefined)

  // We're not allowed to access params not in the samples.
  ensureThrows(() => p.two)

  // TODO: test `in` and iteration
  // assert.deepStrictEqual(
  //   { ...p },
  //   { one: '123', two: '456' },
  //   `Unexpected value when iterating over params object`
  // )

  return null
}
