import type { Instant } from 'next'
import assert from 'node:assert/strict'
import { ensureThrows } from '../../../../../../ensure-error'

export const unstable_instant: Instant = {
  prefetch: 'runtime',
  samples: [
    {
      params: {
        // one: <missing>,
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

  // We're allowed to access names that don't correspond to a param.
  assert.equal('three' in p, false)
  assert.equal(p.three, undefined)

  // We're allowed to look at the keys of the params object even if it's missing some values.
  assert.equal(
    'one' in p,
    true,
    `Expected \`in\` to work for params without samples'`
  )
  assert.equal(
    'two' in p,
    true,
    `Expected \`in\` to work for params without samples'`
  )
  // We're allowed to look at the keys of the params object even if it's missing some values.
  assert.deepEqual(
    Object.keys(p),
    ['one', 'two'],
    `Expected proxied params to contain 'one' and 'two'`
  )

  // We're not allowed to access the values of params that aren't in the samples.
  ensureThrows(() => p.one)

  return null
}
