import {
  createOfflineNavigationCache,
  createOfflineNavigationRSCResponse,
  createOfflineNavigationRSCResponsePayload,
  deleteOfflineNavigationCacheEntry,
  normalizeOfflineNavigationCacheUrl,
  readOfflineNavigationCacheEntry,
  writeOfflineNavigationCacheEntry,
  type OfflineNavigationCacheEntry,
  type OfflineNavigationCacheStorage,
} from './offline-navigation-cache'

type CacheKey = [buildId: string, url: string]

class MemoryOfflineNavigationCacheStorage
  implements OfflineNavigationCacheStorage
{
  entries = new Map<string, OfflineNavigationCacheEntry>()

  async get(key: CacheKey): Promise<OfflineNavigationCacheEntry | undefined> {
    return this.entries.get(this.getKey(key))
  }

  async put(entry: OfflineNavigationCacheEntry): Promise<void> {
    this.entries.set(this.getKey([entry.buildId, entry.url]), entry)
  }

  async delete(key: CacheKey): Promise<void> {
    this.entries.delete(this.getKey(key))
  }

  async deleteBuild(buildId: string): Promise<void> {
    for (const [key, entry] of this.entries) {
      if (entry.buildId === buildId) {
        this.entries.delete(key)
      }
    }
  }

  private getKey(key: CacheKey): string {
    return `${key[0]}\0${key[1]}`
  }
}

class FailingOfflineNavigationCacheStorage
  implements OfflineNavigationCacheStorage
{
  async get(): Promise<OfflineNavigationCacheEntry | undefined> {
    throw new Error('get failed')
  }

  async put(): Promise<void> {
    throw new Error('put failed')
  }

  async delete(): Promise<void> {
    throw new Error('delete failed')
  }

  async deleteBuild(): Promise<void> {
    throw new Error('delete build failed')
  }
}

describe('offline navigation cache', () => {
  it('normalizes exact URL keys without fragments', () => {
    expect(
      normalizeOfflineNavigationCacheUrl(
        'https://example.com/dashboard?tab=activity#settings'
      )
    ).toBe('https://example.com/dashboard?tab=activity')
  })

  it('writes and reads exact URL entries for the current build', async () => {
    const storage = new MemoryOfflineNavigationCacheStorage()
    const cache = createOfflineNavigationCache(storage)

    await expect(
      cache.write({
        buildId: 'build-a',
        url: 'https://example.com/dashboard?tab=activity#settings',
        now: 100,
        staleAt: 200,
        expiresAt: 300,
        payload: { tree: 'payload' },
      })
    ).resolves.toBe(true)

    await expect(
      cache.read('https://example.com/dashboard?tab=activity', {
        buildId: 'build-a',
        now: 150,
      })
    ).resolves.toEqual({
      version: 1,
      kind: 'exact-url',
      buildId: 'build-a',
      url: 'https://example.com/dashboard?tab=activity',
      createdAt: 100,
      staleAt: 200,
      expiresAt: 300,
      payload: { tree: 'payload' },
    })
  })

  it('serializes RSC response payloads for persisted navigation entries', async () => {
    const response = new Response('0:["$","payload"]', {
      headers: {
        'content-type': 'text/x-component',
        'x-nextjs-stale-time': '60',
      },
      status: 200,
      statusText: 'OK',
    })
    Object.defineProperty(response, 'url', {
      value: 'https://example.com/dashboard?_rsc=abc',
    })

    const payload = await createOfflineNavigationRSCResponsePayload(
      response,
      'route-prefetch'
    )
    expect(payload).toMatchObject({
      version: 1,
      kind: 'rsc-response',
      requestKind: 'route-prefetch',
      status: 200,
      statusText: 'OK',
      headers: expect.arrayContaining([
        ['content-type', 'text/x-component'],
        ['x-nextjs-stale-time', '60'],
      ]),
    })

    await expect(
      createOfflineNavigationRSCResponse(payload).text()
    ).resolves.toBe('0:["$","payload"]')
  })

  it('writes RSC response payloads through the exact URL cache', async () => {
    const storage = new MemoryOfflineNavigationCacheStorage()
    const cache = createOfflineNavigationCache(storage)
    const payload = createOfflineNavigationRSCResponsePayload(
      new Response('0:["$","payload"]'),
      'navigation'
    )

    await expect(payload).resolves.toMatchObject({
      kind: 'rsc-response',
      requestKind: 'navigation',
    })
    await expect(
      cache.write({
        buildId: 'build-a',
        expiresAt: 300,
        payload: await payload,
        staleAt: 200,
        url: 'https://example.com/dashboard#section',
        now: 100,
      })
    ).resolves.toBe(true)

    await expect(
      cache.read('https://example.com/dashboard', {
        buildId: 'build-a',
        now: 150,
      })
    ).resolves.toMatchObject({
      buildId: 'build-a',
      createdAt: 100,
      payload: {
        kind: 'rsc-response',
        requestKind: 'navigation',
      },
      staleAt: 200,
      expiresAt: 300,
      url: 'https://example.com/dashboard',
    })
  })

  it('deletes exact URL entries', async () => {
    const storage = new MemoryOfflineNavigationCacheStorage()
    const cache = createOfflineNavigationCache(storage)
    const url = 'https://example.com/dashboard'

    await cache.write({
      buildId: 'build-a',
      url,
      now: 100,
      staleAt: 200,
      expiresAt: 300,
      payload: 'payload',
    })
    await expect(cache.delete(url, { buildId: 'build-a' })).resolves.toBe(true)
    await expect(cache.read(url, { buildId: 'build-a' })).resolves.toBe(null)
  })

  it('ignores and deletes entries whose stored build id does not match', async () => {
    const storage = new MemoryOfflineNavigationCacheStorage()
    const cache = createOfflineNavigationCache(storage)
    const url = 'https://example.com/dashboard'

    await storage.put({
      version: 1,
      kind: 'exact-url',
      buildId: 'build-b',
      url,
      createdAt: 100,
      staleAt: 200,
      expiresAt: 300,
      payload: 'payload',
    })
    storage.entries.set(
      `build-a\0${url}`,
      storage.entries.get(`build-b\0${url}`)!
    )

    await expect(
      cache.read(url, {
        buildId: 'build-a',
        now: 150,
      })
    ).resolves.toBe(null)
    expect(storage.entries.has(`build-a\0${url}`)).toBe(false)
  })

  it('expires entries past their hard expiry time', async () => {
    const storage = new MemoryOfflineNavigationCacheStorage()
    const cache = createOfflineNavigationCache(storage)
    const url = 'https://example.com/dashboard'

    await cache.write({
      buildId: 'build-a',
      url,
      now: 100,
      staleAt: 150,
      expiresAt: 200,
      payload: 'payload',
    })

    await expect(
      cache.read(url, {
        buildId: 'build-a',
        now: 250,
      })
    ).resolves.toBe(null)
    expect(storage.entries.size).toBe(0)
  })

  it('can delete all entries for a build without touching other builds', async () => {
    const storage = new MemoryOfflineNavigationCacheStorage()
    const cache = createOfflineNavigationCache(storage)

    await cache.write({
      buildId: 'build-a',
      url: 'https://example.com/a',
      staleAt: 200,
      expiresAt: 300,
      payload: 'a',
    })
    await cache.write({
      buildId: 'build-b',
      url: 'https://example.com/b',
      staleAt: 200,
      expiresAt: 300,
      payload: 'b',
    })

    await expect(cache.deleteBuild('build-a')).resolves.toBe(true)
    await expect(
      cache.read('https://example.com/a', { buildId: 'build-a', now: 150 })
    ).resolves.toBe(null)
    await expect(
      cache.read('https://example.com/b', { buildId: 'build-b', now: 150 })
    ).resolves.toMatchObject({ payload: 'b' })
  })

  it('treats missing build ids as no-ops', async () => {
    const storage = new MemoryOfflineNavigationCacheStorage()
    const cache = createOfflineNavigationCache(storage)

    await expect(
      cache.write({
        url: 'https://example.com/dashboard',
        staleAt: 200,
        expiresAt: 300,
        payload: 'payload',
      })
    ).resolves.toBe(false)
    await expect(cache.read('https://example.com/dashboard')).resolves.toBe(
      null
    )
    await expect(cache.delete('https://example.com/dashboard')).resolves.toBe(
      false
    )
    await expect(cache.deleteBuild()).resolves.toBe(false)
  })

  it('treats storage failures as non-fatal misses', async () => {
    const cache = createOfflineNavigationCache(
      new FailingOfflineNavigationCacheStorage()
    )

    await expect(
      cache.write({
        buildId: 'build-a',
        url: 'https://example.com/dashboard',
        staleAt: 200,
        expiresAt: 300,
        payload: 'payload',
      })
    ).resolves.toBe(false)
    await expect(
      cache.read('https://example.com/dashboard', { buildId: 'build-a' })
    ).resolves.toBe(null)
    await expect(
      cache.delete('https://example.com/dashboard', { buildId: 'build-a' })
    ).resolves.toBe(false)
    await expect(cache.deleteBuild('build-a')).resolves.toBe(false)
  })

  it('is a no-op when IndexedDB is unavailable', async () => {
    const originalIndexedDB = Object.getOwnPropertyDescriptor(
      globalThis,
      'indexedDB'
    )
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: undefined,
    })

    try {
      await expect(
        writeOfflineNavigationCacheEntry({
          buildId: 'build-a',
          url: 'https://example.com/dashboard',
          staleAt: 200,
          expiresAt: 300,
          payload: 'payload',
        })
      ).resolves.toBe(false)
      await expect(
        readOfflineNavigationCacheEntry('https://example.com/dashboard', {
          buildId: 'build-a',
        })
      ).resolves.toBe(null)
      await expect(
        deleteOfflineNavigationCacheEntry('https://example.com/dashboard', {
          buildId: 'build-a',
        })
      ).resolves.toBe(false)
    } finally {
      if (originalIndexedDB) {
        Object.defineProperty(globalThis, 'indexedDB', originalIndexedDB)
      } else {
        delete (globalThis as { indexedDB?: IDBFactory }).indexedDB
      }
    }
  })
})
