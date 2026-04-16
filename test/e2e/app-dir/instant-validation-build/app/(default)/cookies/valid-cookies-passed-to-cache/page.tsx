import type { Instant } from 'next'
import { cookies } from 'next/headers'
import assert from 'node:assert/strict'

export const unstable_instant: Instant = {
  prefetch: 'runtime',
  samples: [
    {
      cookies: [{ name: 'testCookie', value: 'testValue' }],
    },
  ],
}
export const unstable_prefetch = 'runtime'

export default async function Page() {
  return (
    <main>
      <CachedChild cookieStore={await cookies()} />
    </main>
  )
}

async function CachedChild({ cookieStore }: { cookieStore: unknown }) {
  'use cache'
  // Flight serializes cookies as an iterable, i.e. a sequence of entries
  assert.deepStrictEqual(cookieStore, [
    ['testCookie', { name: 'testCookie', value: 'testValue' }],
  ])
  return null
}
