import type { Instant } from 'next'
import assert from 'node:assert/strict'
import { Suspense } from 'react'

export const unstable_instant: Instant = {
  prefetch: 'static',
  samples: [
    {
      params: {
        slug: 'from-page',
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
        This page defines its own unstable_instant samples, which should
        override the layout samples (no merging).
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
    'from-page',
    `Expected param 'slug' to be 'from-page', got '${p.slug}'`
  )
  return null
}
