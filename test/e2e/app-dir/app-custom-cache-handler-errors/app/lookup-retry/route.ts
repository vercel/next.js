import { cacheLife, cacheTag } from 'next/cache'
import { connection } from 'next/server'
import lookupRetryState from '../../lookup-retry-state'

async function readCachedValue(id: string) {
  'use cache'
  cacheLife('hours')
  cacheTag(`lookup-retry:${id}`)
  lookupRetryState.generationCount++
  return Math.random()
}

export async function GET(request: Request) {
  await connection()
  const searchParams = new URL(request.url).searchParams
  if (searchParams.has('state') && searchParams.has('retention')) {
    return Response.json({
      lookupCount: lookupRetryState.lookupCount,
      generationCount: lookupRetryState.generationCount,
      writeStarted: lookupRetryState.writeStarted,
      writeFailed: lookupRetryState.writeFailed,
    })
  }
  if (searchParams.has('state')) {
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
  if (searchParams.has('retention')) {
    const first = await readCachedValue(id)
    await lookupRetryState.pendingRead
    const second = await readCachedValue(id)
    return Response.json({ first, second })
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
    case 'fail-write-and-hold-read': {
      const id = new URL(request.url).searchParams.get('id')
      if (id === null) {
        return new Response(null, { status: 400 })
      }
      lookupRetryState.id = id
      lookupRetryState.failNextLookup = false
      lookupRetryState.failWrite = true
      lookupRetryState.writeFailed = false
      lookupRetryState.writeStarted = false
      lookupRetryState.lookupCount = 0
      lookupRetryState.generationCount = 0
      lookupRetryState.pendingWrite = new Promise((resolve) => {
        lookupRetryState.releaseWrite = resolve
      })
      lookupRetryState.pendingRead = new Promise((resolve) => {
        lookupRetryState.releaseRead = resolve
      })
      break
    }
    case 'release-read':
      lookupRetryState.releaseRead?.()
      lookupRetryState.releaseRead = null
      lookupRetryState.pendingRead = null
      break
    case 'fail-lookup-and-hold-write': {
      const id = new URL(request.url).searchParams.get('id')
      if (id === null) {
        return new Response(null, { status: 400 })
      }
      lookupRetryState.id = id
      lookupRetryState.failWrite = false
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
