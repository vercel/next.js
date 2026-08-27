async function readCachedValue(key: string, fail: boolean) {
  'use cache'

  await new Promise<void>((resolve) => queueMicrotask(resolve))
  if (fail) {
    throw new Error('expected cache fixture failure')
  }
  return key.length
}

async function readNestedCachedValue(key: string) {
  'use cache'

  return readCachedValue(key, false)
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const key = url.searchParams.get('key') ?? 'default'
  const fail = url.searchParams.has('fail')

  try {
    const values = url.searchParams.has('nested')
      ? [await readNestedCachedValue(key)]
      : url.searchParams.has('join')
        ? await Promise.all([
            readCachedValue(key, fail),
            readCachedValue(key, fail),
          ])
        : [await readCachedValue(key, fail)]
    return Response.json({ values })
  } catch {
    return Response.json({ error: 'expected' }, { status: 500 })
  }
}
