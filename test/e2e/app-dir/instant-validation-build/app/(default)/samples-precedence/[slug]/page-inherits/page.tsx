import assert from 'node:assert/strict'
import { Suspense } from 'react'

// No unstable_instant here — should inherit samples from the layout.

export default async function Page({
  params,
}: {
  params: Promise<Record<string, string>>
}) {
  return (
    <main>
      <p>
        This page does not define unstable_instant samples, so it should inherit
        the samples from the parent layout.
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
  assert.equal(
    p.slug,
    'from-layout',
    `Expected param 'slug' to be 'from-layout', got '${p.slug}'`
  )
  return null
}
