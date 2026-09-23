import { cacheLife, cacheTag, revalidateTag } from 'next/cache'
import { connection } from 'next/server'
import { getOrigin } from '../../origin'

async function getData(key: string) {
  'use cache: remote'

  cacheTag(key)
  const value = process.env[`NEXT_TEST_DATA_${key}`]
  if (value === undefined) {
    // A polling read must not cache a miss before the writer fills this key.
    cacheLife({ stale: 0, revalidate: 0, expire: 0 })
    return null
  }
  return value
}

export async function GET(request: Request) {
  await connection()
  const key = new URL(request.url).searchParams.get('key')
  if (!key) {
    return new Response('Missing key', { status: 400 })
  }
  const value = await getData(key)
  return value === null
    ? new Response('No test data', { status: 404 })
    : new Response(value)
}

export async function POST(request: Request) {
  const key = new URL(request.url).searchParams.get('key')
  if (!key) {
    return new Response('Missing key', { status: 400 })
  }
  const environmentKey = `NEXT_TEST_DATA_${key}`
  const previousValue = process.env[environmentKey]
  process.env[environmentKey] = await request.text()
  try {
    return new Response(await getData(key))
  } finally {
    if (previousValue === undefined) {
      delete process.env[environmentKey]
    } else {
      process.env[environmentKey] = previousValue
    }
  }
}

export async function DELETE(request: Request) {
  const key = new URL(request.url).searchParams.get('key')
  if (!key) {
    return new Response('Missing key', { status: 400 })
  }
  revalidateTag(key, { expire: 0 })
  return new Response(null, { status: 204 })
}

export async function PATCH(request: Request) {
  const key = new URL(request.url).searchParams.get('key')
  if (!key) {
    return new Response('Missing key', { status: 400 })
  }
  const readyKey = `ready-${key}`
  if ((await getData(readyKey)) === null) {
    // Publish a readiness marker before returning the failing value. Concurrent
    // failing reads write the same marker without invalidating it.
    const url = `${getOrigin()}/test-data?key=${encodeURIComponent(readyKey)}`
    const timeoutSignal = AbortSignal.timeout(30_000)
    const fetchData = (init?: RequestInit) =>
      fetch(url, {
        ...init,
        cache: 'no-store',
        signal: AbortSignal.any([timeoutSignal]),
      })
    while (true) {
      const fill = await fetchData({ method: 'POST', body: 'ready' })
      await fill.text()
      const read = await fetchData()
      const currentValue = await read.text()
      if (fill.ok && read.ok && currentValue === 'ready') {
        break
      }
    }
    return new Response('error')
  }

  // Later reads wait for the original error report before succeeding. The
  // response can stream while the data source waits for recovery.
  const timeoutSignal = AbortSignal.timeout(30_000)
  while (true) {
    const report = await fetch(
      `${getOrigin()}/test-data?key=${encodeURIComponent(`report-${key}`)}`,
      { cache: 'no-store', signal: AbortSignal.any([timeoutSignal]) }
    )
    await report.text()
    if (report.ok) {
      break
    }
  }
  return new Response('ready')
}
