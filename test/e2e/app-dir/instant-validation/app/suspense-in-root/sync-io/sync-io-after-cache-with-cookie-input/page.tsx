import { Instant } from 'next'
import { cookies } from 'next/headers'
import { Fragment, Suspense } from 'react'

export const instant: Instant = {
  level: 'experimental-error',
  unstable_samples: [{ cookies: [{ name: 'testCookie', value: 'testValue' }] }],
}

// cookies() is passed as a promise input to a public "use cache" function.
// The cache doesn't read the cookies in its body — they're only part of the cache key.
// After the cache resolves, Date.now() is sync IO that should error.
//
// This test validates that the cache input encoding resolves in the
// Runtime stage. Date.now() should either error or be allowed
// depending on if partialPrefetching is enabled or not.

async function cachedFn(cookiePromise: Promise<string>) {
  'use cache'
  // Intentionally not reading the cookie promise in the body.
  // It's only used as part of the cache key via input encoding.
  return 'cached result'
}

export default async function Page() {
  return (
    <main>
      <p>
        Page with sync IO after cache with cookie input:{' '}
        <SuspenseIfNotPartialPrefetching>
          <SyncIOAfterCache />
        </SuspenseIfNotPartialPrefetching>
      </p>
    </main>
  )
}

// Before partialPrefetching, cookies() is not allowed in shells,
// so it would fail instant validation unless wrapped in suspense.
// We're not interested in checking if cookies blocks,
// only in wheter the Sync IO after triggers an error.
const SuspenseIfNotPartialPrefetching = process.env.__NEXT_PARTIAL_PREFETCHING
  ? Fragment
  : Suspense

async function SyncIOAfterCache() {
  const cookiePromise = cookies().then((c) => c.get('testCookie')?.value ?? '')
  await cachedFn(cookiePromise)
  return Date.now()
}
