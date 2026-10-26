import { cacheLife, cacheTag } from 'next/cache'
import { connection } from 'next/server'
import lookupRetryState from '../../lookup-retry-state'

async function readCachedValue(id: string) {
  'use cache'
  cacheLife('hours')
  cacheTag(`lookup-retry:${id}`)
  return Math.random()
}

export async function GET(request: Request) {
  await connection()
  if (new URL(request.url).searchParams.has('state')) {
    return Response.json({
      lookupCount: lookupRetryState.lookupCount,
      writeStarted: lookupRetryState.writeStarted,
      writeCompleted: lookupRetryState.writeCompleted,
      cacheReadsCompleted: lookupRetryState.cacheReadsCompleted,
    })
  }
  const id = new URL(request.url).searchParams.get('id')
  if (id === null) {
    return new Response(null, { status: 400 })
  }
  // Both concurrent calls must reject from the same handler `get()`.
  const results = await Promise.allSettled([
    readCachedValue(id),
    readCachedValue(id),
  ])
  // Retry in the same request before `pendingWrite` resolves. The second read
  // must reuse the generated value while `set()` is still pending.
  const first = await readCachedValue(id)
  const second = await readCachedValue(id)
  lookupRetryState.cacheReadsCompleted = true
  return Response.json({
    failures: results.map((result) =>
      result.status === 'rejected' ? result.reason.message : 'fulfilled'
    ),
    first,
    second,
  })
}

export async function POST(request: Request) {
  switch (await request.text()) {
    case 'fail-lookup-and-hold-write': {
      const id = new URL(request.url).searchParams.get('id')
      if (id === null) {
        return new Response(null, { status: 400 })
      }
      lookupRetryState.id = id
      lookupRetryState.failNextLookup = true
      lookupRetryState.lookupCount = 0
      lookupRetryState.writeStarted = false
      lookupRetryState.writeCompleted = false
      lookupRetryState.cacheReadsCompleted = false
      lookupRetryState.pendingWrite = new Promise((resolve) => {
        lookupRetryState.releaseWrite = resolve
      })
      break
    }
    case 'release-write':
      lookupRetryState.releaseWrite?.()
      lookupRetryState.releaseWrite = null
      lookupRetryState.pendingWrite = null
      break
    default:
      return new Response(null, { status: 400 })
  }
  return new Response(null, { status: 204 })
}
