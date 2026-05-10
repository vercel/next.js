import {
  createOfflineNavigationRSCResponse,
  createOfflineNavigationRSCResponsePayload,
  createOfflineNavigationSegmentCachePersistence,
  createOfflineNavigationVaryPathKey,
  deleteOfflineNavigationCacheEntriesForBuild,
  isOfflineNavigationRSCResponsePayload,
  serializeOfflineNavigationVaryPath,
  type OfflineNavigationCacheStorage,
  type OfflineNavigationRouteRecord,
  type OfflineNavigationRouteRecordWrite,
  type OfflineNavigationSegmentRecord,
  type OfflineNavigationSegmentRecordWrite,
} from './offline-navigation-cache'

type SegmentCacheKey = [buildId: string, key: string]

class MemoryOfflineNavigationCacheStorage
  implements OfflineNavigationCacheStorage
{
  routeEntries = new Map<string, OfflineNavigationRouteRecord>()
  segmentEntries = new Map<string, OfflineNavigationSegmentRecord>()
  routeCacheVersion = 0
  segmentCacheVersion = 0

  async deleteBuild(buildId: string): Promise<void> {
    for (const [key, entry] of this.routeEntries) {
      if (entry.buildId === buildId) {
        this.routeEntries.delete(key)
      }
    }
    for (const [key, entry] of this.segmentEntries) {
      if (entry.buildId === buildId) {
        this.segmentEntries.delete(key)
      }
    }
  }

  async getRoute(
    key: SegmentCacheKey
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

  async deleteRoute(key: SegmentCacheKey): Promise<void> {
    this.routeEntries.delete(this.getKey(key))
  }

  async getRouteCacheVersion(): Promise<number> {
    return this.routeCacheVersion
  }

  async incrementRouteCacheVersion(): Promise<number> {
    this.routeCacheVersion++
    return this.routeCacheVersion
  }

  async getSegment(
    key: SegmentCacheKey
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

  async deleteSegment(key: SegmentCacheKey): Promise<void> {
    this.segmentEntries.delete(this.getKey(key))
  }

  async getSegmentCacheVersion(): Promise<number> {
    return this.segmentCacheVersion
  }

  async incrementSegmentCacheVersion(): Promise<number> {
    this.segmentCacheVersion++
    return this.segmentCacheVersion
  }

  private getKey(key: SegmentCacheKey): string {
    return `${key[0]}\0${key[1]}`
  }
}

class FailingOfflineNavigationCacheStorage
  implements OfflineNavigationCacheStorage
{
  async deleteBuild(): Promise<void> {
    throw new Error('delete build failed')
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

  async getRouteCacheVersion(): Promise<number> {
    throw new Error('get route cache version failed')
  }

  async incrementRouteCacheVersion(): Promise<number> {
    throw new Error('increment route cache version failed')
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

  async getSegmentCacheVersion(): Promise<number> {
    throw new Error('get segment cache version failed')
  }

  async incrementSegmentCacheVersion(): Promise<number> {
    throw new Error('increment segment cache version failed')
  }
}

function createRouteRecord(
  key: string,
  pathname: string,
  overrides: Partial<OfflineNavigationRouteRecordWrite> = {}
): OfflineNavigationRouteRecordWrite {
  return {
    buildId: 'build-a',
    key,
    staleAt: 200,
    route: {
      pathname,
      nextUrl: null,
      canonicalUrl: pathname,
      renderedSearch: '',
      couldBeIntercepted: false,
      supportsPerSegmentPrefetching: true,
      hasDynamicRewrite: false,
    },
    routeVaryPath: [],
    tree: { segment: pathname },
    metadata: { head: pathname },
    ...overrides,
  }
}

function createSegmentRecord(
  key: string,
  overrides: Partial<OfflineNavigationSegmentRecordWrite> = {}
): OfflineNavigationSegmentRecordWrite {
  return {
    buildId: 'build-a',
    key,
    staleAt: 200,
    segment: {
      fetchStrategy: 1,
      isPartial: false,
      payloadIndex: 0,
    },
    segmentVaryPath: [],
    payload: { kind: 'segment-payload' },
    ...overrides,
  }
}

describe('offline navigation cache', () => {
  it('serializes vary paths into stable persisted record keys', () => {
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

  it('serializes segment-prefetch RSC payloads for persisted segment records', async () => {
    const response = new Response('0:["$","payload"]', {
      headers: {
        'content-type': 'text/x-component',
        'x-nextjs-stale-time': '60',
      },
      status: 200,
      statusText: 'OK',
    })

    const payload = await createOfflineNavigationRSCResponsePayload(
      response,
      'segment-prefetch'
    )
    expect(payload).toMatchObject({
      version: 1,
      kind: 'rsc-response',
      requestKind: 'segment-prefetch',
    })

    const restoredResponse = createOfflineNavigationRSCResponse(payload)
    await expect(restoredResponse.text()).resolves.toBe('0:["$","payload"]')
    expect(isOfflineNavigationRSCResponsePayload(payload)).toBe(true)
    expect(
      isOfflineNavigationRSCResponsePayload({ ...payload, body: null })
    ).toBe(false)
    expect(
      isOfflineNavigationRSCResponsePayload({
        ...payload,
        requestKind: 'route-prefetch',
      })
    ).toBe(false)
  })

  it('stores route and segment records with independent durable cache versions', async () => {
    const storage = new MemoryOfflineNavigationCacheStorage()
    const cache = createOfflineNavigationSegmentCachePersistence(storage)
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
      cache.writeRoute(
        createRouteRecord('route:/dashboard', '/dashboard', {
          routeVaryPath,
        })
      )
    ).resolves.toBe(true)
    await expect(
      cache.writeSegment(
        createSegmentRecord('segment:/dashboard:children/page', {
          segmentVaryPath,
        })
      )
    ).resolves.toBe(true)

    await expect(
      cache.readRoute('route:/dashboard', {
        buildId: 'build-a',
        now: 150,
      })
    ).resolves.toMatchObject({
      buildId: 'build-a',
      cacheVersion: 0,
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
      cacheVersion: 0,
      key: 'segment:/dashboard:children/page',
      kind: 'segment',
      segment: {
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
      cacheVersion: 0,
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

  it('lists only fresh current-version route and segment records', async () => {
    const storage = new MemoryOfflineNavigationCacheStorage()
    const cache = createOfflineNavigationSegmentCachePersistence(storage)

    await cache.writeRoute(createRouteRecord('route:/dashboard', '/dashboard'))
    await cache.writeRoute(
      createRouteRecord('route:/expired', '/expired', {
        staleAt: 110,
      })
    )
    await cache.writeSegment(
      createSegmentRecord('segment:/dashboard:children/page')
    )
    await cache.writeSegment(
      createSegmentRecord('segment:/expired:children/page', {
        staleAt: 110,
      })
    )

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

  it('ignores and deletes route and segment records whose stored build id does not match', async () => {
    const storage = new MemoryOfflineNavigationCacheStorage()
    const cache = createOfflineNavigationSegmentCachePersistence(storage)

    await storage.putRoute({
      version: 1,
      kind: 'route',
      buildId: 'build-b',
      key: 'route:/dashboard',
      cacheVersion: 0,
      staleAt: 200,
      route: createRouteRecord('route:/dashboard', '/dashboard').route,
      routeVaryPath: [],
      tree: null,
      metadata: null,
    })
    storage.routeEntries.set(
      'build-a\0route:/dashboard',
      storage.routeEntries.get('build-b\0route:/dashboard')!
    )
    await storage.putSegment({
      version: 1,
      kind: 'segment',
      buildId: 'build-b',
      key: 'segment:/dashboard',
      cacheVersion: 0,
      staleAt: 200,
      segment: createSegmentRecord('segment:/dashboard').segment,
      segmentVaryPath: [],
      payload: null,
    })
    storage.segmentEntries.set(
      'build-a\0segment:/dashboard',
      storage.segmentEntries.get('build-b\0segment:/dashboard')!
    )

    await expect(
      cache.readRoute('route:/dashboard', {
        buildId: 'build-a',
        now: 150,
      })
    ).resolves.toBe(null)
    await expect(
      cache.readSegment('segment:/dashboard', {
        buildId: 'build-a',
        now: 150,
      })
    ).resolves.toBe(null)
    expect(storage.routeEntries.has('build-a\0route:/dashboard')).toBe(false)
    expect(storage.segmentEntries.has('build-a\0segment:/dashboard')).toBe(
      false
    )
  })

  it('can delete all route and segment records for a build without touching other builds', async () => {
    const storage = new MemoryOfflineNavigationCacheStorage()
    const cache = createOfflineNavigationSegmentCachePersistence(storage)

    await cache.writeRoute(createRouteRecord('route:/a', '/a'))
    await cache.writeRoute(
      createRouteRecord('route:/b', '/b', { buildId: 'build-b' })
    )
    await cache.writeSegment(createSegmentRecord('segment:/a'))
    await cache.writeSegment(
      createSegmentRecord('segment:/b', { buildId: 'build-b' })
    )

    await expect(cache.deleteBuild('build-a')).resolves.toBe(true)
    await expect(
      cache.readRoute('route:/a', { buildId: 'build-a', now: 150 })
    ).resolves.toBe(null)
    await expect(
      cache.readRoute('route:/b', { buildId: 'build-b', now: 150 })
    ).resolves.toMatchObject({ key: 'route:/b' })
    await expect(
      cache.readSegment('segment:/a', { buildId: 'build-a', now: 150 })
    ).resolves.toBe(null)
    await expect(
      cache.readSegment('segment:/b', { buildId: 'build-b', now: 150 })
    ).resolves.toMatchObject({ key: 'segment:/b' })
  })

  it('treats missing build ids as no-ops', async () => {
    const storage = new MemoryOfflineNavigationCacheStorage()
    const cache = createOfflineNavigationSegmentCachePersistence(storage)

    await expect(
      cache.writeRoute(
        createRouteRecord('route:/dashboard', '/dashboard', { buildId: '' })
      )
    ).resolves.toBe(false)
    await expect(
      cache.writeSegment(
        createSegmentRecord('segment:/dashboard', { buildId: '' })
      )
    ).resolves.toBe(false)
    await expect(cache.readRoute('route:/dashboard')).resolves.toBe(null)
    await expect(cache.readSegment('segment:/dashboard')).resolves.toBe(null)
    await expect(cache.deleteRoute('route:/dashboard')).resolves.toBe(false)
    await expect(cache.deleteSegment('segment:/dashboard')).resolves.toBe(false)
    await expect(cache.deleteBuild()).resolves.toBe(false)
  })

  it('treats storage failures as non-fatal misses', async () => {
    const cache = createOfflineNavigationSegmentCachePersistence(
      new FailingOfflineNavigationCacheStorage()
    )

    await expect(
      cache.writeRoute(createRouteRecord('route:/dashboard', '/dashboard'))
    ).resolves.toBe(false)
    await expect(
      cache.readRoute('route:/dashboard', { buildId: 'build-a' })
    ).resolves.toBe(null)
    await expect(cache.readRoutes({ buildId: 'build-a' })).resolves.toEqual([])
    await expect(
      cache.deleteRoute('route:/dashboard', { buildId: 'build-a' })
    ).resolves.toBe(false)
    await expect(cache.invalidateRoutes()).resolves.toBe(false)
    await expect(
      cache.writeSegment(createSegmentRecord('segment:/dashboard'))
    ).resolves.toBe(false)
    await expect(
      cache.readSegment('segment:/dashboard', { buildId: 'build-a' })
    ).resolves.toBe(null)
    await expect(cache.readSegments({ buildId: 'build-a' })).resolves.toEqual(
      []
    )
    await expect(
      cache.deleteSegment('segment:/dashboard', { buildId: 'build-a' })
    ).resolves.toBe(false)
    await expect(cache.invalidateSegments()).resolves.toBe(false)
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
        deleteOfflineNavigationCacheEntriesForBuild('build-a')
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
