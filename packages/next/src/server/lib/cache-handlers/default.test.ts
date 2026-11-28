/**
 * @jest-environment node
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import { runInNewContext } from 'node:vm'
import { setFlagsFromString } from 'node:v8'
import { createDefaultCacheHandler } from './default'
import type { CacheEntry, CacheHandler } from './types'
import { tagsManifest } from '../incremental-cache/tags-manifest.external'

setFlagsFromString('--expose-gc')
const forceGarbageCollection = runInNewContext('gc') as () => void

const originalDevServer = process.env.__NEXT_DEV_SERVER

describe('default use cache handler', () => {
  beforeEach(() => {
    tagsManifest.clear()
    delete process.env.__NEXT_DEV_SERVER
  })

  afterAll(() => {
    tagsManifest.clear()
    if (originalDevServer === undefined) {
      delete process.env.__NEXT_DEV_SERVER
    } else {
      process.env.__NEXT_DEV_SERVER = originalDevServer
    }
  })

  it('returns an independent, fully readable stream from every get', async () => {
    const handler = createDefaultCacheHandler(1024 * 1024)
    await handler.set('key', Promise.resolve(createEntry()))

    const first = await handler.get('key', [])
    const second = await handler.get('key', [])

    if (!first || !second) {
      throw new Error('Expected cache entries')
    }

    expect(first.value).not.toBe(second.value)

    const [firstText, secondText] = await Promise.all([
      new Response(first.value).text(),
      new Response(second.value).text(),
    ])

    expect(firstText).toBe('cached value')
    expect(secondText).toBe('cached value')
  })

  it('waits for a pending set before resolving a get', async () => {
    const handler = createDefaultCacheHandler(1024 * 1024)
    const pendingEntry = createDeferredEntry()

    const setPromise = handler.set('key', pendingEntry.promise)
    const getPromise = handler.get('key', [])

    pendingEntry.resolve(createEntry())
    await setPromise

    const entry = await getPromise
    if (!entry) {
      throw new Error('Expected a cache entry')
    }

    expect(await new Response(entry.value).text()).toBe('cached value')
  })

  it('treats an entry whose value stream errors as a miss', async () => {
    const handler = createDefaultCacheHandler(1024 * 1024)
    const pendingEntry = createDeferredEntry()

    const setPromise = handler.set('key', pendingEntry.promise)
    const getPromise = handler.get('key', [])

    pendingEntry.resolve(
      createEntry({
        value: new ReadableStream({
          start(controller) {
            controller.error(new Error('stream failed'))
          },
        }),
      })
    )

    await expect(setPromise).resolves.toBeUndefined()
    await expect(getPromise).resolves.toBeUndefined()
    await expect(handler.get('key', [])).resolves.toBeUndefined()
  })

  it('returns 0 from getExpiration for tags that were never revalidated', async () => {
    const handler = createDefaultCacheHandler(1024 * 1024)

    expect(await handler.getExpiration([])).toBe(0)
    expect(await handler.getExpiration(['never-revalidated'])).toBe(0)
  })

  it('returns the revalidation time from getExpiration after updateTags', async () => {
    const handler = createDefaultCacheHandler(1024 * 1024)
    const before = Math.floor(performance.timeOrigin + performance.now())

    await handler.updateTags(['tag'])

    expect(await handler.getExpiration(['tag'])).toBeGreaterThanOrEqual(before)
    expect(await handler.getExpiration(['other'])).toBe(0)
  })

  it('serves a stale entry after a tag is revalidated and drops it once the tag expires', async () => {
    const handler = createDefaultCacheHandler(1024 * 1024)
    await handler.set(
      'key',
      Promise.resolve(
        createEntry({ tags: ['tag'], timestamp: Date.now() - 1000 })
      )
    )

    await handler.updateTags(['tag'], { expire: 60 })

    const entry = await handler.get('key', [])
    if (!entry) {
      throw new Error('Expected a cache entry')
    }

    expect(entry.revalidate).toBe(-1)
    expect(await new Response(entry.value).text()).toBe('cached value')

    await handler.updateTags(['tag'])
    await waitForClockToAdvance()

    expect(await handler.get('key', [])).toBeUndefined()
  })

  it('treats an entry with a negative expire as a miss', async () => {
    const handler = createDefaultCacheHandler(1024 * 1024)
    await handler.set('key', Promise.resolve(createEntry({ expire: -1 })))

    expect(await handler.get('key', [])).toBeUndefined()
  })

  it('does not store an entry with an expire of 0 in production', async () => {
    const handler = createDefaultCacheHandler(1024 * 1024)
    await handler.set('key', Promise.resolve(createEntry({ expire: 0 })))

    expect(await handler.get('key', [])).toBeUndefined()
  })

  it('stores an entry with an expire of 0 in the dev server and keeps its real expire', async () => {
    process.env.__NEXT_DEV_SERVER = 'true'
    const handler = createDefaultCacheHandler(1024 * 1024)
    await handler.set('key', Promise.resolve(createEntry({ expire: 0 })))

    const entry = await handler.get('key', [])
    if (!entry) {
      throw new Error('Expected a cache entry')
    }

    expect(entry.expire).toBe(0)
    expect(await new Response(entry.value).text()).toBe('cached value')
  })

  it('treats an entry with a negative expire as a miss in the dev server', async () => {
    process.env.__NEXT_DEV_SERVER = 'true'
    const handler = createDefaultCacheHandler(1024 * 1024)
    await handler.set('key', Promise.resolve(createEntry({ expire: -1 })))

    expect(await handler.get('key', [])).toBeUndefined()
  })

  it('drops an entry past its revalidate time in production', async () => {
    const handler = createDefaultCacheHandler(1024 * 1024)
    await handler.set(
      'key',
      Promise.resolve(
        createEntry({ timestamp: Date.now() - 61_000, revalidate: 60 })
      )
    )

    expect(await handler.get('key', [])).toBeUndefined()
  })

  it('serves an entry past its revalidate time in the dev server until it expires', async () => {
    process.env.__NEXT_DEV_SERVER = 'true'
    const handler = createDefaultCacheHandler(1024 * 1024)
    await handler.set(
      'key',
      Promise.resolve(
        createEntry({ timestamp: Date.now() - 61_000, revalidate: 60 })
      )
    )

    const entry = await handler.get('key', [])
    if (!entry) {
      throw new Error('Expected a cache entry')
    }

    expect(entry.revalidate).toBe(60)
    expect(await new Response(entry.value).text()).toBe('cached value')
  })

  it('retains a short-lived entry in the dev server for the minimum prerenderable expire', async () => {
    process.env.__NEXT_DEV_SERVER = 'true'
    const handler = createDefaultCacheHandler(1024 * 1024)
    await handler.set(
      'key',
      Promise.resolve(
        createEntry({ timestamp: Date.now() - 200_000, expire: 120 })
      )
    )

    const entry = await handler.get('key', [])
    if (!entry) {
      throw new Error('Expected a cache entry')
    }

    expect(entry.expire).toBe(120)
  })

  it('drops an entry in the dev server once past the minimum prerenderable expire', async () => {
    process.env.__NEXT_DEV_SERVER = 'true'
    const handler = createDefaultCacheHandler(1024 * 1024)
    await handler.set(
      'key',
      Promise.resolve(
        createEntry({ timestamp: Date.now() - 301_000, expire: 120 })
      )
    )

    expect(await handler.get('key', [])).toBeUndefined()
  })

  it('drops an entry in the dev server once past an expire longer than the minimum', async () => {
    process.env.__NEXT_DEV_SERVER = 'true'
    const handler = createDefaultCacheHandler(1024 * 1024)
    await handler.set(
      'key',
      Promise.resolve(
        createEntry({ timestamp: Date.now() - 601_000, expire: 600 })
      )
    )

    expect(await handler.get('key', [])).toBeUndefined()
  })

  it('returns undefined for a key that was never set', async () => {
    const handler = createDefaultCacheHandler(1024 * 1024)
    await handler.set('key', Promise.resolve(createEntry()))

    expect(await handler.get('other-key', [])).toBeUndefined()
  })

  it('overwrites an existing entry when the same key is set again', async () => {
    const handler = createDefaultCacheHandler(1024 * 1024)
    await handler.set('key', Promise.resolve(createEntry()))
    await handler.set(
      'key',
      Promise.resolve(
        createEntry({ value: createStream('updated value'), revalidate: 30 })
      )
    )

    const entry = await handler.get('key', [])
    if (!entry) {
      throw new Error('Expected a cache entry')
    }

    expect(entry.revalidate).toBe(30)
    expect(await new Response(entry.value).text()).toBe('updated value')
  })

  it('evicts the least recently used entry once the max size is exceeded', async () => {
    // Each entry is 12 bytes of value plus a 1 character key.
    const handler = createDefaultCacheHandler(20)
    await handler.set('a', Promise.resolve(createEntry()))
    await handler.set('b', Promise.resolve(createEntry()))

    expect(await handler.get('a', [])).toBeUndefined()
    expect(await readCache(handler, 'b')).toBe('cached value')
  })

  it('never stores anything when the max size is 0', async () => {
    const handler = createDefaultCacheHandler(0)
    await handler.set('key', Promise.resolve(createEntry()))

    expect(await handler.get('key', [])).toBeUndefined()
    await expect(handler.refreshTags()).resolves.toBeUndefined()
    await handler.updateTags(['tag'])
    expect(await handler.getExpiration(['tag'])).toBe(0)
  })

  it('returns the most recent expiration across multiple tags', async () => {
    const handler = createDefaultCacheHandler(1024 * 1024)

    await handler.updateTags(['soon'], { expire: 10 })
    await handler.updateTags(['later'], { expire: 100 })

    const soon = await handler.getExpiration(['soon'])
    const later = await handler.getExpiration(['later'])

    expect(later).toBeGreaterThan(soon)
    expect(await handler.getExpiration(['soon', 'later', 'unknown'])).toBe(
      later
    )
  })

  it('marks a tag stale without expiring it when durations omit expire', async () => {
    const handler = createDefaultCacheHandler(1024 * 1024)
    await handler.set(
      'key',
      Promise.resolve(
        createEntry({ tags: ['tag'], timestamp: Date.now() - 1000 })
      )
    )

    await handler.updateTags(['tag'], {})
    await waitForClockToAdvance()

    expect(await handler.getExpiration(['tag'])).toBe(0)

    const entry = await handler.get('key', [])
    if (!entry) {
      throw new Error('Expected a cache entry')
    }

    expect(entry.revalidate).toBe(-1)
  })

  it('drops an entry immediately when its tag is revalidated without durations', async () => {
    const handler = createDefaultCacheHandler(1024 * 1024)
    await handler.set(
      'key',
      Promise.resolve(
        createEntry({ tags: ['tag'], timestamp: Date.now() - 1000 })
      )
    )

    await handler.updateTags(['tag'])
    await waitForClockToAdvance()

    expect(await handler.get('key', [])).toBeUndefined()
  })

  it('does not affect entries without the revalidated tag', async () => {
    const handler = createDefaultCacheHandler(1024 * 1024)
    await handler.set(
      'key',
      Promise.resolve(
        createEntry({ tags: ['other'], timestamp: Date.now() - 1000 })
      )
    )

    await handler.updateTags(['tag'])
    await waitForClockToAdvance()

    const entry = await handler.get('key', [])
    if (!entry) {
      throw new Error('Expected a cache entry')
    }

    expect(entry.revalidate).toBe(60)
  })

  it('serves an entry created after its tag was revalidated as fresh', async () => {
    const handler = createDefaultCacheHandler(1024 * 1024)

    await handler.updateTags(['tag'], { expire: 60 })
    await waitForClockToAdvance()

    await handler.set(
      'key',
      Promise.resolve(
        createEntry({
          tags: ['tag'],
          timestamp: performance.timeOrigin + performance.now(),
        })
      )
    )

    const entry = await handler.get('key', [])
    if (!entry) {
      throw new Error('Expected a cache entry')
    }

    expect(entry.revalidate).toBe(60)
  })

  it('resolves refreshTags without changing stored entries', async () => {
    const handler = createDefaultCacheHandler(1024 * 1024)
    await populateCache(handler)

    await expect(handler.refreshTags()).resolves.toBeUndefined()
    expect(await readCache(handler)).toBe('cached value')
  })

  /**
   * These tests guard the handler against retaining the request that filled or
   * read an entry. Whether a regression here fails depends on the
   * `AsyncLocalStorage` implementation of the environment:
   *
   * - Node 20 and 22 attach the active store to every promise, so a retained
   *   stream keeps the store reachable, and these tests fail on a regression.
   * - Node 24 and later use `AsyncContextFrame`, and these tests pass with or
   *   without the retention.
   *
   * CI runs Node 20.9, so the guard holds there. A regression is invisible to a
   * developer who runs the suite on Node 24 or later.
   */

  it('does not retain the async context that populated an entry', async () => {
    const handler = createDefaultCacheHandler(1024 * 1024)
    const requestStoreRef = await runInRequestContext(() =>
      populateCache(handler)
    )

    await expectCollected(requestStoreRef)

    expect(await readCache(handler)).toBe('cached value')
  })

  it('does not retain the async context that read an entry', async () => {
    const handler = createDefaultCacheHandler(1024 * 1024)
    await populateCache(handler)

    const requestStoreRef = await runInRequestContext(async () => {
      expect(await readCache(handler)).toBe('cached value')
    })

    await expectCollected(requestStoreRef)
  })
})

async function runInRequestContext(
  callback: () => Promise<void>
): Promise<WeakRef<object>> {
  const requestStorage = new AsyncLocalStorage<object>()
  let requestStoreRef: WeakRef<object> | undefined

  await requestStorage.run({ requestId: 'request' }, async () => {
    const requestStore = requestStorage.getStore()

    if (!requestStore) {
      throw new Error('Expected a request store')
    }

    requestStoreRef = new WeakRef(requestStore)
    await callback()
  })

  if (!requestStoreRef) {
    throw new Error('Expected a request store reference')
  }

  return requestStoreRef
}

function createStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text))
      controller.close()
    },
  })
}

function createEntry(overrides: Partial<CacheEntry> = {}): CacheEntry {
  return {
    value: createStream('cached value'),
    tags: [],
    stale: 60,
    timestamp: Date.now(),
    expire: 120,
    revalidate: 60,
    ...overrides,
  }
}

function createDeferredEntry(): {
  promise: Promise<CacheEntry>
  resolve: (entry: CacheEntry) => void
} {
  let resolve: (entry: CacheEntry) => void = () => {}
  const promise = new Promise<CacheEntry>((res) => {
    resolve = res
  })

  return { promise, resolve }
}

async function waitForClockToAdvance(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 5))
}

async function populateCache(handler: CacheHandler): Promise<void> {
  await handler.set('key', Promise.resolve(createEntry()))
}

async function readCache(
  handler: CacheHandler,
  cacheKey = 'key'
): Promise<string> {
  const entry = await handler.get(cacheKey, [])
  if (!entry) {
    throw new Error('Expected a cache entry')
  }

  return new Response(entry.value).text()
}

async function expectCollected(ref: WeakRef<object>): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    forceGarbageCollection()
    await new Promise<void>((resolve) => setImmediate(resolve))
  }

  expect(ref.deref()).toBeUndefined()
}
