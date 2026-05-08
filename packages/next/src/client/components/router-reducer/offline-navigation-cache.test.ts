import {
  createOfflineNavigationCache,
  createOfflineNavigationRSCResponse,
  createOfflineNavigationRSCResponsePayload,
  createOfflineNavigationRouterCache,
  createOfflineNavigationVaryPathKey,
  deleteOfflineNavigationCacheEntry,
  getOfflineNavigationRSCResponseCacheSkipReason,
  invalidateOfflineNavigationCacheEntries,
  isOfflineNavigationRSCResponsePayload,
  normalizeOfflineNavigationCacheUrl,
  readOfflineNavigationCacheEntry,
  serializeOfflineNavigationVaryPath,
  writeOfflineNavigationCacheEntry,
  type OfflineNavigationRSCResponseCacheEligibility,
  type OfflineNavigationRSCResponseCacheSkipReason,
  type OfflineNavigationCacheEntry,
  type OfflineNavigationCacheStorage,
  type OfflineNavigationRouteRecord,
  type OfflineNavigationSegmentRecord,
} from './offline-navigation-cache'

type CacheKey = [buildId: string, url: string]
type RouterCacheKey = [buildId: string, key: string]

class MemoryOfflineNavigationCacheStorage
  implements OfflineNavigationCacheStorage
{
  entries = new Map<string, OfflineNavigationCacheEntry>()
  routeEntries = new Map<string, OfflineNavigationRouteRecord>()
  segmentEntries = new Map<string, OfflineNavigationSegmentRecord>()
  cacheEpoch = 0
  routeCacheEpoch = 0
  segmentCacheEpoch = 0

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

  async getRoute(
    key: RouterCacheKey
  ): Promise<OfflineNavigationRouteRecord | undefined> {
    return this.routeEntries.get(this.getKey(key))
  }

  async getRoutes(buildId: string): Promise<OfflineNavigationRouteRecord[]> {
    return Array.from(this.routeEntries.values()).filter(
      (entry) => entry.buildId === buildId
    )
  }

  async putRoute(entry: OfflineNavigationRouteRecord): Promise<void> {
    this.routeEntries.set(this.getKey([entry.buildId, entry.key]), entry)
  }

  async deleteRoute(key: RouterCacheKey): Promise<void> {
    this.routeEntries.delete(this.getKey(key))
  }

  async getRouteCacheEpoch(): Promise<number> {
    return this.routeCacheEpoch
  }

  async incrementRouteCacheEpoch(): Promise<number> {
    this.routeCacheEpoch++
    return this.routeCacheEpoch
  }

  async getSegment(
    key: RouterCacheKey
  ): Promise<OfflineNavigationSegmentRecord | undefined> {
    return this.segmentEntries.get(this.getKey(key))
  }

  async getSegments(
    buildId: string
  ): Promise<OfflineNavigationSegmentRecord[]> {
    return Array.from(this.segmentEntries.values()).filter(
      (entry) => entry.buildId === buildId
    )
  }

  async putSegment(entry: OfflineNavigationSegmentRecord): Promise<void> {
    this.segmentEntries.set(this.getKey([entry.buildId, entry.key]), entry)
  }

  async deleteSegment(key: RouterCacheKey): Promise<void> {
    this.segmentEntries.delete(this.getKey(key))
  }

  async getSegmentCacheEpoch(): Promise<number> {
    return this.segmentCacheEpoch
  }

  async incrementSegmentCacheEpoch(): Promise<number> {
    this.segmentCacheEpoch++
    return this.segmentCacheEpoch
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

  async getRoute(): Promise<OfflineNavigationRouteRecord | undefined> {
    throw new Error('get route failed')
  }

  async getRoutes(): Promise<OfflineNavigationRouteRecord[]> {
    throw new Error('get routes failed')
  }

  async putRoute(): Promise<void> {
    throw new Error('put route failed')
  }

  async deleteRoute(): Promise<void> {
    throw new Error('delete route failed')
  }

  async getRouteCacheEpoch(): Promise<number> {
    throw new Error('get route epoch failed')
  }

  async incrementRouteCacheEpoch(): Promise<number> {
    throw new Error('increment route epoch failed')
  }

  async getSegment(): Promise<OfflineNavigationSegmentRecord | undefined> {
    throw new Error('get segment failed')
  }

  async getSegments(): Promise<OfflineNavigationSegmentRecord[]> {
    throw new Error('get segments failed')
  }

  async putSegment(): Promise<void> {
    throw new Error('put segment failed')
  }

  async deleteSegment(): Promise<void> {
    throw new Error('delete segment failed')
  }

  async getSegmentCacheEpoch(): Promise<number> {
    throw new Error('get segment epoch failed')
  }

  async incrementSegmentCacheEpoch(): Promise<number> {
    throw new Error('increment segment epoch failed')
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

  it('serializes vary paths into stable router record keys', () => {
    const fallback = {}
    const varyPath = {
      id: null,
      value: 'children/page',
      parent: {
        id: '?',
        value: fallback,
        parent: {
          id: 'slug',
          value: 'hello',
          parent: null,
        },
      },
    }

    expect(serializeOfflineNavigationVaryPath(varyPath)).toEqual([
      {
        id: null,
        value: {
          kind: 'value',
          value: 'children/page',
        },
      },
      {
        id: '?',
        value: {
          kind: 'fallback',
        },
      },
      {
        id: 'slug',
        value: {
          kind: 'value',
          value: 'hello',
        },
      },
    ])
    expect(createOfflineNavigationVaryPathKey(varyPath)).toBe(
      '[{"id":null,"value":{"kind":"value","value":"children/page"}},{"id":"?","value":{"kind":"fallback"}},{"id":"slug","value":{"kind":"value","value":"hello"}}]'
    )
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
    expect(
      isOfflineNavigationRSCResponsePayload({
        ...payload,
        requestKind: 'segment-prefetch',
      })
    ).toBe(true)
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

  it('stores route and segment records with independent durable epochs', async () => {
    const storage = new MemoryOfflineNavigationCacheStorage()
    const cache = createOfflineNavigationRouterCache(storage)
    const routeVaryPath = serializeOfflineNavigationVaryPath({
      id: null,
      value: '/dashboard',
      parent: {
        id: '?',
        value: '',
        parent: {
          id: null,
          value: null,
          parent: null,
        },
      },
    })
    const segmentVaryPath = serializeOfflineNavigationVaryPath({
      id: null,
      value: 'children/page',
      parent: null,
    })

    await expect(
      cache.writeRoute({
        buildId: 'build-a',
        key: 'route:/dashboard',
        now: 100,
        staleAt: 200,
        expiresAt: 300,
        route: {
          pathname: '/dashboard',
          search: '',
          nextUrl: null,
          canonicalUrl: '/dashboard',
          renderedSearch: '',
          couldBeIntercepted: false,
          supportsPerSegmentPrefetching: true,
          hasDynamicRewrite: false,
        },
        routeVaryPath,
        tree: { segment: 'dashboard' },
        metadata: { segment: 'metadata' },
      })
    ).resolves.toBe(true)
    await expect(
      cache.writeSegment({
        buildId: 'build-a',
        key: 'segment:/dashboard:children/page',
        now: 100,
        staleAt: 200,
        expiresAt: 300,
        segment: {
          requestKey: 'children/page',
          fetchStrategy: 1,
          isPartial: false,
          payloadIndex: 0,
        },
        segmentVaryPath,
        payload: { kind: 'segment-payload' },
      })
    ).resolves.toBe(true)

    await expect(
      cache.readRoute('route:/dashboard', {
        buildId: 'build-a',
        now: 150,
      })
    ).resolves.toMatchObject({
      buildId: 'build-a',
      cacheEpoch: 0,
      key: 'route:/dashboard',
      kind: 'route',
      route: {
        pathname: '/dashboard',
      },
      routeVaryPath,
      version: 1,
    })
    await expect(
      cache.readSegment('segment:/dashboard:children/page', {
        buildId: 'build-a',
        now: 150,
      })
    ).resolves.toMatchObject({
      buildId: 'build-a',
      cacheEpoch: 0,
      key: 'segment:/dashboard:children/page',
      kind: 'segment',
      segment: {
        requestKey: 'children/page',
        payloadIndex: 0,
      },
      segmentVaryPath,
      version: 1,
    })

    await expect(cache.invalidateRoutes()).resolves.toBe(true)
    await expect(
      cache.readRoute('route:/dashboard', {
        buildId: 'build-a',
        now: 150,
      })
    ).resolves.toBe(null)
    await expect(
      cache.readSegment('segment:/dashboard:children/page', {
        buildId: 'build-a',
        now: 150,
      })
    ).resolves.toMatchObject({
      cacheEpoch: 0,
      key: 'segment:/dashboard:children/page',
    })

    await expect(cache.invalidateSegments()).resolves.toBe(true)
    await expect(
      cache.readSegment('segment:/dashboard:children/page', {
        buildId: 'build-a',
        now: 150,
      })
    ).resolves.toBe(null)
  })

  it('lists only fresh current-epoch route and segment records', async () => {
    const storage = new MemoryOfflineNavigationCacheStorage()
    const cache = createOfflineNavigationRouterCache(storage)
    const routeVaryPath = serializeOfflineNavigationVaryPath({
      id: null,
      value: '/dashboard',
      parent: null,
    })
    const segmentVaryPath = serializeOfflineNavigationVaryPath({
      id: null,
      value: 'children/page',
      parent: null,
    })

    await cache.writeRoute({
      buildId: 'build-a',
      key: 'route:/dashboard',
      now: 100,
      staleAt: 200,
      expiresAt: 300,
      route: {
        pathname: '/dashboard',
        search: '',
        nextUrl: null,
        canonicalUrl: '/dashboard',
        renderedSearch: '',
        couldBeIntercepted: false,
        supportsPerSegmentPrefetching: true,
        hasDynamicRewrite: false,
      },
      routeVaryPath,
      tree: { segment: 'dashboard' },
      metadata: { segment: 'metadata' },
    })
    await cache.writeRoute({
      buildId: 'build-a',
      key: 'route:/expired',
      now: 100,
      staleAt: 110,
      expiresAt: 120,
      route: {
        pathname: '/expired',
        search: '',
        nextUrl: null,
        canonicalUrl: '/expired',
        renderedSearch: '',
        couldBeIntercepted: false,
        supportsPerSegmentPrefetching: true,
        hasDynamicRewrite: false,
      },
      routeVaryPath,
      tree: { segment: 'expired' },
      metadata: { segment: 'metadata' },
    })
    await cache.writeSegment({
      buildId: 'build-a',
      key: 'segment:/dashboard:children/page',
      now: 100,
      staleAt: 200,
      expiresAt: 300,
      segment: {
        requestKey: 'children/page',
        fetchStrategy: 1,
        isPartial: false,
        payloadIndex: 0,
      },
      segmentVaryPath,
      payload: { kind: 'segment-payload' },
    })
    await cache.writeSegment({
      buildId: 'build-a',
      key: 'segment:/expired:children/page',
      now: 100,
      staleAt: 110,
      expiresAt: 120,
      segment: {
        requestKey: 'children/page',
        fetchStrategy: 1,
        isPartial: false,
        payloadIndex: 0,
      },
      segmentVaryPath,
      payload: { kind: 'expired-payload' },
    })

    await expect(
      cache.readRoutes({ buildId: 'build-a', now: 150 })
    ).resolves.toMatchObject([{ key: 'route:/dashboard' }])
    await expect(
      cache.readSegments({ buildId: 'build-a', now: 150 })
    ).resolves.toMatchObject([{ key: 'segment:/dashboard:children/page' }])
    expect(storage.routeEntries.has('build-a\0route:/expired')).toBe(false)
    expect(
      storage.segmentEntries.has('build-a\0segment:/expired:children/page')
    ).toBe(false)

    await expect(
      cache.readRoutes({ buildId: 'build-b', now: 150 })
    ).resolves.toEqual([])
    await expect(
      cache.readSegments({ buildId: 'build-b', now: 150 })
    ).resolves.toEqual([])
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
    const routerCache = createOfflineNavigationRouterCache(
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
    await expect(
      routerCache.writeRoute({
        buildId: 'build-a',
        key: 'route:/dashboard',
        staleAt: 200,
        expiresAt: 300,
        route: {
          pathname: '/dashboard',
          search: '',
          nextUrl: null,
          canonicalUrl: '/dashboard',
          renderedSearch: '',
          couldBeIntercepted: false,
          supportsPerSegmentPrefetching: true,
          hasDynamicRewrite: false,
        },
        routeVaryPath: [],
        tree: null,
        metadata: null,
      })
    ).resolves.toBe(false)
    await expect(
      routerCache.readRoute('route:/dashboard', { buildId: 'build-a' })
    ).resolves.toBe(null)
    await expect(
      routerCache.deleteRoute('route:/dashboard', { buildId: 'build-a' })
    ).resolves.toBe(false)
    await expect(routerCache.invalidateRoutes()).resolves.toBe(false)
    await expect(
      routerCache.writeSegment({
        buildId: 'build-a',
        key: 'segment:/dashboard',
        staleAt: 200,
        expiresAt: 300,
        segment: {
          requestKey: 'children/page',
          fetchStrategy: 1,
          isPartial: false,
          payloadIndex: 0,
        },
        segmentVaryPath: [],
        payload: null,
      })
    ).resolves.toBe(false)
    await expect(
      routerCache.readSegment('segment:/dashboard', { buildId: 'build-a' })
    ).resolves.toBe(null)
    await expect(
      routerCache.deleteSegment('segment:/dashboard', { buildId: 'build-a' })
    ).resolves.toBe(false)
    await expect(routerCache.invalidateSegments()).resolves.toBe(false)
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
