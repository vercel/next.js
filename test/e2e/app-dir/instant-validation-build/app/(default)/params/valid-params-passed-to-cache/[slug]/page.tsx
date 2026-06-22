import type { Instant } from 'next'
import assert from 'node:assert/strict'
import { Fragment, Suspense } from 'react'

export const instant: Instant = {
  level: 'experimental-error',
  unstable_samples: [{ params: { slug: 'hello' } }],
}
export const prefetch = 'allow-runtime'

export default async function Page({
  params,
}: {
  params: Promise<Record<string, string>>
}) {
  return (
    <main>
      <SuspenseInPartialPrefetching>
        <Inner params={params} />
      </SuspenseInPartialPrefetching>
    </main>
  )
}

async function Inner({ params }: { params: Promise<Record<string, string>> }) {
  return <CachedChild params={await params} />
}

const SuspenseInPartialPrefetching = process.env.__NEXT_PARTIAL_PREFETCHING
  ? Suspense
  : Fragment

async function CachedChild({ params }: { params: Record<string, string> }) {
  'use cache'
  assert.equal(
    params.slug,
    'hello',
    `Expected params.slug to be 'hello', got '${params.slug}'`
  )
  assert.deepStrictEqual(Object.keys(params), ['slug'])

  return <div id="slug">{params.slug}</div>
}
