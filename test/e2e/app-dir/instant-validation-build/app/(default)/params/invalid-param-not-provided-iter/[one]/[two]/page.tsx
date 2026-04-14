import type { Instant } from 'next'
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
        This page reads a param that is not declared in the sample via iterating
        over its keys and values, so it should fail validation with an
        exhaustiveness error.
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

  // We're not allowed to access the values of params that aren't in the samples.
  ensureThrows(() => ({ ...p }))

  return null
}
