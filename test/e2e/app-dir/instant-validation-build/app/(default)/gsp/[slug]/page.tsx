import type { Instant } from 'next'
import assert from 'node:assert/strict'
import { cookies } from 'next/headers'
import { Suspense } from 'react'
import { AssertParamsClient } from './client'

// samples use 'hello', but generateStaticParams uses 'foo'/'bar'.
// During validation, the sample params should be used, not the GSP values.
export const unstable_instant: Instant = {
  prefetch: 'runtime',
  samples: [
    {
      params: {
        slug: 'hello',
      },
    },
  ],
}
export const unstable_prefetch = 'runtime'

export function generateStaticParams() {
  return [{ slug: 'foo' }, { slug: 'bar' }]
}

export default async function Page({
  params,
}: {
  params: Promise<Record<string, string>>
}) {
  return (
    <main>
      <Suspense fallback={<div>Loading...</div>}>
        <AssertSampleParams params={params} />
      </Suspense>
    </main>
  )
}

async function AssertSampleParams({
  params,
}: {
  params: Promise<Record<string, string>>
}) {
  // Gate behind cookies() so this subtree is only reachable during
  // instant validation (not during regular GSP prerenders, where
  // cookies() creates a dynamic hole and defers the Suspense boundary).
  await cookies()

  const p = await params
  // During validation, the param value should come from the sample ('hello'),
  // not from generateStaticParams ('foo' or 'bar').
  assert.equal(
    p.slug,
    'hello',
    `Expected param 'slug' to be 'hello' (from sample), got '${p.slug}'`
  )

  // Client component rendered after the cookies() gate, so it also
  // only runs during validation.
  return (
    <>
      <div id="slug">{p.slug}</div>
      <AssertParamsClient />
    </>
  )
}
