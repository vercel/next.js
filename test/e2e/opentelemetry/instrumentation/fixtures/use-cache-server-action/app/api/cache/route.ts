import { cacheLife } from 'next/cache'

const backgroundFailures = new Set<string>()

async function readCachedValue(key: string, fail: boolean) {
  'use cache'

  await new Promise<void>((resolve) => queueMicrotask(resolve))
  if (fail) {
    throw new Error('expected cache fixture failure')
  }
  return key.length
}

async function readStaleCachedValue(key: string) {
  'use cache: stale'

  cacheLife({ revalidate: 1, expire: 60 })
  await new Promise<void>((resolve) => queueMicrotask(resolve))
  if (backgroundFailures.has(key)) {
    throw new Error('expected background cache revalidation failure')
  }
  return readCachedValue(key, false)
}

async function readNestedCachedValue(key: string) {
  'use cache'

  return readCachedValue(key, false)
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const key = url.searchParams.get('key') ?? 'default'
  const fail = url.searchParams.has('fail')
  const background = url.searchParams.has('background')

  if (url.searchParams.has('background-fail')) {
    backgroundFailures.add(key)
  }

  try {
    const values = url.searchParams.has('nested')
      ? [await readNestedCachedValue(key)]
      : url.searchParams.has('join')
        ? await Promise.all([
            readCachedValue(key, fail),
            readCachedValue(key, fail),
          ])
        : [
            await (background
              ? readStaleCachedValue(key)
              : readCachedValue(key, fail)),
          ]
    return Response.json({ values })
  } catch {
    return Response.json({ error: 'expected' }, { status: 500 })
  }
}

export const POST = GET
