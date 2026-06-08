import type { Instant } from 'next'
import assert from 'node:assert/strict'
import { ensureThrows } from '../../../../../../ensure-error'

export const unstable_instant: Instant = {
  level: 'experimental-error',
  unstable_samples: [
    {
      params: {
        one: '123',
        // two: <missing>
      },
    },
  ],
}
export const prefetch = 'allow-runtime'

export default async function Page({
  params,
}: {
  params: Promise<Record<string, string>>
}) {
  return (
    <main>
      <p>
        This page reads a param that is not declared in the sample, so it should
        fail validation with an exhaustiveness error. It catches the error
        thrown by the param access, but validation should still fail.
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

  try {
    // We're not allowed to access params not in the samples.
    ensureThrows(() => p.two, `Expected accessing an undeclared param to throw`)
  } catch (err) {
    // We swallow the error. It should still be reported and fail the validation.
  }

  // TODO(instant-validation-build): test `in` and iteration
  // assert.deepStrictEqual(
  //   { ...p },
  //   { one: '123', two: '456' },
  //   `Unexpected value when iterating over params object`
  // )

  return null
}
