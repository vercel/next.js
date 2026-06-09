import type { Instant } from 'next'
import { headers } from 'next/headers'
import assert from 'node:assert/strict'

export const unstable_instant: Instant = {
  level: 'experimental-error',
  unstable_samples: [
    {
      headers: [['x-test-header', 'testValue']],
    },
  ],
}
export const prefetch = 'allow-runtime'

export default async function Page() {
  return (
    <main>
      <CachedChild headerStore={await headers()} />
    </main>
  )
}

async function CachedChild({ headerStore }: { headerStore: unknown }) {
  'use cache'
  // Flight serializes headers as an iterable, i.e. a sequence of entries
  assert.deepStrictEqual(headerStore, [['x-test-header', 'testValue']])
  return null
}
