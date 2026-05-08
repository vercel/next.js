import {
  createOfflineNavigationCache,
  createOfflineNavigationRSCResponse,
  createOfflineNavigationRSCResponsePayload,
  deleteOfflineNavigationCacheEntry,
  getOfflineNavigationRSCResponseCacheSkipReason,
  invalidateOfflineNavigationCacheEntries,
  isOfflineNavigationRSCResponsePayload,
  normalizeOfflineNavigationCacheUrl,
  readOfflineNavigationCacheEntry,
  writeOfflineNavigationCacheEntry,
  type OfflineNavigationRSCResponseCacheEligibility,
  type OfflineNavigationRSCResponseCacheSkipReason,
  type OfflineNavigationCacheEntry,
  type OfflineNavigationCacheStorage,
} from './offline-navigation-cache'

type CacheKey = [buildId: string, url: string]

class MemoryOfflineNavigationCacheStorage
  implements OfflineNavigationCacheStorage
{
  entries = new Map<string, OfflineNavigationCacheEntry>()
  cacheEpoch = 0

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

  async getCacheEpoch(): Promise<number> {
    return this.cacheEpoch
  }

  async incrementCacheEpoch(): Promise<number> {
    this.cacheEpoch++
    return this.cacheEpoch
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

  async getCacheEpoch(): Promise<number> {
    throw new Error('get epoch failed')
  }

  async incrementCacheEpoch(): Promise<number> {
    throw new Error('increment epoch failed')
  }
}

type OfflineNavigationEnvKey =
  | '__NEXT_CONFIG_OUTPUT'
  | '__NEXT_DEV_SERVER'
  | '__NEXT_OFFLINE_NAVIGATIONS'
  | 'NODE_ENV'

const offlineNavigationEnvKeys: Array<OfflineNavigationEnvKey> = [
  '__NEXT_CONFIG_OUTPUT',
  '__NEXT_DEV_SERVER',
  '__NEXT_OFFLINE_NAVIGATIONS',
  'NODE_ENV',
]

function withOfflineNavigationCacheEnv<T>(
  env: Partial<Record<OfflineNavigationEnvKey, string | undefined>>,
  test: () => T
): T {
  const originalEnv: Partial<
    Record<OfflineNavigationEnvKey, string | undefined>
  > = {}

  for (const key of offlineNavigationEnvKeys) {
    originalEnv[key] = process.env[key]
  }

  const writableEnv = process.env as Record<string, string | undefined>

  for (const key of offlineNavigationEnvKeys) {
    const value = env[key]
    if (value === undefined) {
      delete writableEnv[key]
    } else {
      writableEnv[key] = value
    }
  }

  try {
    return test()
  } finally {
    for (const key of offlineNavigationEnvKeys) {
      const value = originalEnv[key]
      if (value === undefined) {
        delete writableEnv[key]
      } else {
        writableEnv[key] = value
      }
    }
  }
}

function getCacheSkipReason(
  eligibility: Partial<OfflineNavigationRSCResponseCacheEligibility> = {},
  env: Partial<Record<OfflineNavigationEnvKey, string | undefined>> = {}
) {
  return withOfflineNavigationCacheEnv(
    {
      __NEXT_CONFIG_OUTPUT: undefined,
      __NEXT_DEV_SERVER: undefined,
      __NEXT_OFFLINE_NAVIGATIONS: 'true',
      NODE_ENV: 'production',
      ...env,
    },
    () =>
      getOfflineNavigationRSCResponseCacheSkipReason({
        origin: 'https://example.com',
        requestKind: 'navigation',
        url: 'https://example.com/dashboard',
        ...eligibility,
      })
  )
}

describe('offline navigation cache', () => {
  it('normalizes exact URL keys without fragments', () => {
    expect(
      normalizeOfflineNavigationCacheUrl(
        'https://example.com/dashboard?tab=activity#settings'
      )
    ).toBe('https://example.com/dashboard?tab=activity')
  })

  it('preserves encoded query values and duplicate search param order', () => {
    const first = normalizeOfflineNavigationCacheUrl(
      'https://example.com/docs/url-stress/space%20value/?token=a%2Bb&tag=one&tag=two#section-1'
    )
    const reordered = normalizeOfflineNavigationCacheUrl(
      'https://example.com/docs/url-stress/space%20value/?tag=one&tag=two&token=a%2Bb#section-1'
    )

    expect(first).toBe(
      'https://example.com/docs/url-stress/space%20value?token=a%2Bb&tag=one&tag=two'
    )
    expect(reordered).toBe(
      'https://example.com/docs/url-stress/space%20value?tag=one&tag=two&token=a%2Bb'
    )
    expect(first).not.toBe(reordered)
  })

  it('normalizes exact URL keys with the configured trailing slash', () => {
    const originalTrailingSlash = process.env.__NEXT_TRAILING_SLASH
    process.env.__NEXT_TRAILING_SLASH = 'true'

    try {
      expect(
        normalizeOfflineNavigationCacheUrl('https://example.com/dashboard')
      ).toBe('https://example.com/dashboard/')
      expect(
        normalizeOfflineNavigationCacheUrl('https://example.com/feed.xml')
      ).toBe('https://example.com/feed.xml')
    } finally {
      if (originalTrailingSlash === undefined) {
        delete process.env.__NEXT_TRAILING_SLASH
      } else {
        process.env.__NEXT_TRAILING_SLASH = originalTrailingSlash
      }
    }
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
      version: 2,
      kind: 'exact-url',
      buildId: 'build-a',
      url: 'https://example.com/dashboard?tab=activity',
      cacheEpoch: 0,
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

    const restoredResponse = createOfflineNavigationRSCResponse(payload)
    expect(restoredResponse.url).toBe('https://example.com/dashboard?_rsc=abc')
    await expect(restoredResponse.text()).resolves.toBe('0:["$","payload"]')
    expect(isOfflineNavigationRSCResponsePayload(payload)).toBe(true)
    expect(
      isOfflineNavigationRSCResponsePayload({ ...payload, body: null })
    ).toBe(false)
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
      cacheEpoch: 0,
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

  it('accepts initial load RSC responses for offline document boot', async () => {
    const payload = await createOfflineNavigationRSCResponsePayload(
      new Response('0:["$","payload"]'),
      'initial-load'
    )

    expect(isOfflineNavigationRSCResponsePayload(payload)).toBe(true)
    expect(payload).toMatchObject({
      kind: 'rsc-response',
      requestKind: 'initial-load',
    })
  })

  it('returns cache eligibility skip reasons for unsupported RSC responses', () => {
    const cases: Array<{
      expected: OfflineNavigationRSCResponseCacheSkipReason
      eligibility?: Partial<OfflineNavigationRSCResponseCacheEligibility>
      env?: Partial<Record<OfflineNavigationEnvKey, string | undefined>>
    }> = [
      {
        expected: 'disabled',
        env: { __NEXT_OFFLINE_NAVIGATIONS: undefined },
      },
      { expected: 'dev-server', env: { __NEXT_DEV_SERVER: 'true' } },
      { expected: 'not-production', env: { NODE_ENV: 'development' } },
      { expected: 'output-export', env: { __NEXT_CONFIG_OUTPUT: 'export' } },
      { expected: 'unsupported-request', eligibility: { requestKind: null } },
      { expected: 'missing-payload', eligibility: { hasCachePayload: false } },
      {
        expected: 'cross-origin',
        eligibility: { url: 'https://external.example/dashboard' },
      },
      {
        expected: 'unsupported-segment-prefetching',
        eligibility: { supportsPerSegmentPrefetching: false },
      },
      {
        expected: 'runtime-prefetch',
        eligibility: { hasRuntimePrefetch: true },
      },
      {
        expected: 'partial-response',
        eligibility: { hasPartialResponse: true },
      },
      { expected: 'hmr-refresh', eligibility: { isHmrRefresh: true } },
      { expected: 'interception', eligibility: { isInterception: true } },
      { expected: 'postponed', eligibility: { isPostponed: true } },
      { expected: 'redirected', eligibility: { isRedirected: true } },
    ]

    for (const { expected, eligibility, env } of cases) {
      expect(getCacheSkipReason(eligibility, env)).toBe(expected)
    }
  })

  it('allows eligible same-origin RSC responses in production', () => {
    expect(getCacheSkipReason()).toBe(null)
  })

  it('allows initial-load RSC responses without per-segment prefetch support', () => {
    expect(
      getCacheSkipReason({
        requestKind: 'initial-load',
        supportsPerSegmentPrefetching: false,
      })
    ).toBe(null)
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

  it('invalidates exact URL entries with a durable cache epoch', async () => {
    const storage = new MemoryOfflineNavigationCacheStorage()
    const cache = createOfflineNavigationCache(storage)
    const url = 'https://example.com/dashboard'

    await cache.write({
      buildId: 'build-a',
      url,
      now: 100,
      staleAt: 200,
      expiresAt: 300,
      payload: 'stale payload',
    })
    await expect(
      cache.read(url, { buildId: 'build-a', now: 150 })
    ).resolves.toMatchObject({
      cacheEpoch: 0,
      payload: 'stale payload',
    })

    await expect(cache.invalidate()).resolves.toBe(true)
    await expect(
      cache.read(url, { buildId: 'build-a', now: 150 })
    ).resolves.toBe(null)
    expect(storage.entries.size).toBe(0)

    await cache.write({
      buildId: 'build-a',
      url,
      now: 175,
      staleAt: 250,
      expiresAt: 350,
      payload: 'fresh payload',
    })
    await expect(
      cache.read(url, { buildId: 'build-a', now: 200 })
    ).resolves.toMatchObject({
      cacheEpoch: 1,
      payload: 'fresh payload',
    })
  })

  it('ignores and deletes entries whose stored build id does not match', async () => {
    const storage = new MemoryOfflineNavigationCacheStorage()
    const cache = createOfflineNavigationCache(storage)
    const url = 'https://example.com/dashboard'

    await storage.put({
      version: 2,
      kind: 'exact-url',
      buildId: 'build-b',
      url,
      cacheEpoch: 0,
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
    await expect(cache.invalidate()).resolves.toBe(false)
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
      await expect(invalidateOfflineNavigationCacheEntries()).resolves.toBe(
        false
      )
    } finally {
      if (originalIndexedDB) {
        Object.defineProperty(globalThis, 'indexedDB', originalIndexedDB)
      } else {
        delete (globalThis as { indexedDB?: IDBFactory }).indexedDB
      }
    }
  })
})
