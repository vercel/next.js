import type { Instant } from 'next'
import assert from 'node:assert/strict'

export const unstable_instant: Instant = {
  prefetch: 'static',
  samples: [{}],
}

export default async function Page({
  params,
}: {
  params: Promise<Record<string, string>>
}) {
  return (
    <main>
      <p>
        When validated in build, awaiting params on a page with no params should
        not block.
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
  assert.deepStrictEqual(p, {}, `Unexpected value in params object`)

  return null
}
