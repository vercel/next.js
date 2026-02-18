import { cookies } from 'next/headers'

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{}],
}

// This page HAS runtime prefetch enabled. cookies() is passed as a promise
// input to a public "use cache" function. The cache doesn't read the cookies
// in its body — they're only part of the cache key. After the cache resolves,
// Date.now() is sync IO that should error because we're in a
// runtime-prefetchable segment where cookies() has resolved at EarlyRuntime.
//
// This test validates that the cache input encoding resolves in the correct
// runtime stage (EarlyRuntime for prefetchable segments). If the cache input
// abort signal incorrectly waited for the Runtime stage, the cache would
// resolve later, and Date.now() would happen at the Runtime stage where
// canSyncInterrupt returns false — missing the error.

async function cachedFn(cookiePromise: Promise<string>) {
  'use cache'
  // Intentionally not reading the cookie promise in the body.
  // It's only used as part of the cache key via input encoding.
  return 'cached result'
}

export default async function Page() {
  const cookiePromise = cookies().then((c) => c.get('testCookie')?.value ?? '')
  await cachedFn(cookiePromise)
  const now = Date.now()
  return (
    <main>
      <p>Runtime page with sync IO after cache with cookie input: {now}</p>
    </main>
  )
}
