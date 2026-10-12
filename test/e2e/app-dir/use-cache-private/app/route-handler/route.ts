import { cacheLife } from 'next/cache'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { setTimeout } from 'timers/promises'

async function getPrivateValue(params: { id: string }) {
  'use cache: private'

  // Setting a stale time doesn't have an effect in a route handler, but this
  // might be a cache function that's shared with server components, so the
  // cacheLife call should still be allowed.
  cacheLife({ stale: 1000 })

  // Simulate I/O latency so the concurrent calls below overlap.
  await setTimeout(200)

  // Reading cookies is allowed inside a private cache, also in a route handler.
  const testCookie = (await cookies()).get('use-cache-private-test')

  return `${params.id}:${testCookie?.value ?? '<empty>'}:${Math.random()}`
}

export async function GET(request: NextRequest) {
  // The private cache already makes this route dynamic. The search param gives
  // each test its own `id`, and therefore its own cache key, so the entry that
  // dev persists for one test is never served to another.
  const id = request.nextUrl.searchParams.get('id') ?? 'default'

  // Each call passes a fresh object literal, so the React.cache memo that wraps
  // every cache function misses on reference equality and the lookup falls
  // through to the serialized cache key.
  const [concurrentA, concurrentB] = await Promise.all([
    getPrivateValue({ id }),
    getPrivateValue({ id }),
  ])

  // The map of pending intra-request invocations drops an entry once its fill
  // completes, so this delay puts the call below outside the in-flight window.
  // Reuse then depends on the completed entry that the request retains, not on
  // joining a pending fill.
  await setTimeout(100)

  const sequential = await getPrivateValue({ id })

  return Response.json({ concurrentA, concurrentB, sequential })
}
