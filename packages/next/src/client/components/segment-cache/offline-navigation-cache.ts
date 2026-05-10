import { getNavigationBuildId } from '../../navigation-build-id'
// Durable storage for offline navigations mirrors the in-memory Segment Cache.
// Route records describe the route tree that can be reconstructed for a URL.
// Segment records carry the prefetched RSC payloads that fill that tree after a
// hard reload through the offline fallback document.
//
// IndexedDB is used instead of the service worker CacheStorage because the
// the client needs structured records, independent route and segment
// invalidation, and RSC response bodies tied to the current Next.js build.
const DATABASE_NAME = 'next-offline-navigation-cache'
const DATABASE_VERSION = 1
const ROUTE_STORE_NAME = 'route-data'
const SEGMENT_STORE_NAME = 'segment-data'
const METADATA_STORE_NAME = 'metadata'
const ROUTE_CACHE_VERSION_KEY = 'route-cache-version'
const SEGMENT_CACHE_VERSION_KEY = 'segment-cache-version'
const ROUTE_RECORD_VERSION = 1
const SEGMENT_RECORD_VERSION = 1
const RSC_RESPONSE_PAYLOAD_VERSION = 1

type OfflineNavigationSegmentCacheKey = [buildId: string, key: string]
export type OfflineNavigationRSCResponseRequestKind = 'segment-prefetch'

export type OfflineNavigationSerializedVaryPathValue =
  | {
      kind: 'value'
      value: string | null
    }
  | {
      kind: 'fallback'
    }

export type OfflineNavigationSerializedVaryPathPart = {
  id: string | null
  value: OfflineNavigationSerializedVaryPathValue
}

export type OfflineNavigationSerializedVaryPath =
  OfflineNavigationSerializedVaryPathPart[]

export type OfflineNavigationSerializableVaryPath = {
  id: string | null
  value: string | null | object
  parent: OfflineNavigationSerializableVaryPath | null
}

export type OfflineNavigationRouteRecord = {
  version: typeof ROUTE_RECORD_VERSION
  kind: 'route'
  buildId: string
  key: string
  cacheVersion: number
  staleAt: number
  // `pathname` and `nextUrl` duplicate part of `routeVaryPath`, but the route
  // hydration step also needs them to rebuild the known-route trie used for
  // dynamic route matching. Keep them as the small route index, not as a second
  // router state model.
  route: {
    pathname: string
    nextUrl: string | null
    canonicalUrl: string
    renderedSearch: string
    couldBeIntercepted: boolean
    supportsPerSegmentPrefetching: boolean
    hasDynamicRewrite: boolean
  }
  routeVaryPath: OfflineNavigationSerializedVaryPath
  tree: unknown
  metadata: unknown
}

export type OfflineNavigationSegmentRecord = {
  version: typeof SEGMENT_RECORD_VERSION
  kind: 'segment'
  buildId: string
  key: string
  cacheVersion: number
  staleAt: number
  segment: {
    fetchStrategy: number
    isPartial: boolean
    payloadIndex: number
  }
  segmentVaryPath: OfflineNavigationSerializedVaryPath
  payload: unknown
}

export type OfflineNavigationRSCResponsePayload = {
  version: typeof RSC_RESPONSE_PAYLOAD_VERSION
  kind: 'rsc-response'
  requestKind: OfflineNavigationRSCResponseRequestKind
  body: ArrayBuffer
}

export type OfflineNavigationCacheReadOptions = {
  buildId?: string
  now?: number
}

export type OfflineNavigationRouteRecordWrite = Omit<
  OfflineNavigationRouteRecord,
  'buildId' | 'cacheVersion' | 'kind' | 'version'
> & {
  buildId?: string
}

export type OfflineNavigationSegmentRecordWrite = Omit<
  OfflineNavigationSegmentRecord,
  'buildId' | 'cacheVersion' | 'kind' | 'version'
> & {
  buildId?: string
}

export type OfflineNavigationCacheStorage = {
  deleteBuild(buildId: string): Promise<void>
  getRoute(
    key: OfflineNavigationSegmentCacheKey
  ): Promise<OfflineNavigationRouteRecord | undefined>
  getRoutes(buildId: string): Promise<OfflineNavigationRouteRecord[]>
  putRoute(entry: OfflineNavigationRouteRecord): Promise<void>
  deleteRoute(key: OfflineNavigationSegmentCacheKey): Promise<void>
  getRouteCacheVersion(): Promise<number>
  incrementRouteCacheVersion(): Promise<number>
  getSegment(
    key: OfflineNavigationSegmentCacheKey
  ): Promise<OfflineNavigationSegmentRecord | undefined>
  getSegments(buildId: string): Promise<OfflineNavigationSegmentRecord[]>
  putSegment(entry: OfflineNavigationSegmentRecord): Promise<void>
  deleteSegment(key: OfflineNavigationSegmentCacheKey): Promise<void>
  getSegmentCacheVersion(): Promise<number>
  incrementSegmentCacheVersion(): Promise<number>
}

export type OfflineNavigationSegmentCachePersistence = {
  readRoute: (
    key: string,
    options?: OfflineNavigationCacheReadOptions
  ) => Promise<OfflineNavigationRouteRecord | null>
  readRoutes: (
    options?: OfflineNavigationCacheReadOptions
  ) => Promise<OfflineNavigationRouteRecord[]>
  writeRoute: (entry: OfflineNavigationRouteRecordWrite) => Promise<boolean>
  deleteRoute: (
    key: string,
    options?: OfflineNavigationCacheReadOptions
  ) => Promise<boolean>
  invalidateRoutes: () => Promise<boolean>
  readSegment: (
    key: string,
    options?: OfflineNavigationCacheReadOptions
  ) => Promise<OfflineNavigationSegmentRecord | null>
  readSegments: (
    options?: OfflineNavigationCacheReadOptions
  ) => Promise<OfflineNavigationSegmentRecord[]>
  writeSegment: (entry: OfflineNavigationSegmentRecordWrite) => Promise<boolean>
  deleteSegment: (
    key: string,
    options?: OfflineNavigationCacheReadOptions
  ) => Promise<boolean>
  invalidateSegments: () => Promise<boolean>
  deleteBuild: (buildId?: string) => Promise<boolean>
}

// Segment Cache keys are linked lists called "vary paths". Each node represents
// one input that can affect a cache entry, like pathname, search params,
// Next-Url, or a dynamic route param. The in-memory cache can use an object
// identity as the generic "fallback" marker; persisted records need a structured
// marker so the same key can be rebuilt after a reload.
export function serializeOfflineNavigationVaryPath(
  varyPath: OfflineNavigationSerializableVaryPath | null
): OfflineNavigationSerializedVaryPath {
  const parts: OfflineNavigationSerializedVaryPath = []
  let current = varyPath

  while (current !== null) {
    parts.push({
      id: current.id,
      value:
        current.value === null || typeof current.value === 'string'
          ? {
              kind: 'value',
              value: current.value,
            }
          : {
              kind: 'fallback',
            },
    })
    current = current.parent
  }

  return parts
}

export function createOfflineNavigationVaryPathKey(
  varyPath: OfflineNavigationSerializableVaryPath | null
): string {
  return JSON.stringify(serializeOfflineNavigationVaryPath(varyPath))
}

// Route records and segment records are invalidated independently, mirroring the
// in-memory route and segment cache versions. A write stores the current
// persisted cache version on the record; invalidation bumps the version instead
// of scanning and deleting every entry. Old-version records miss on read.
export function createOfflineNavigationSegmentCachePersistence(
  storage: OfflineNavigationCacheStorage
): OfflineNavigationSegmentCachePersistence {
  return {
    readRoute: async (key, options) => {
      return runOfflineNavigationCacheOperation(async () => {
        const buildId = getCacheBuildId(options?.buildId)
        if (buildId === null) {
          return null
        }

        const cacheKey: OfflineNavigationSegmentCacheKey = [buildId, key]
        const [entry, cacheVersion] = await Promise.all([
          storage.getRoute(cacheKey),
          storage.getRouteCacheVersion(),
        ])
        if (!entry) {
          return null
        }

        if (!isUsableRouteRecord(entry, buildId, key, cacheVersion, options)) {
          await storage.deleteRoute(cacheKey)
          return null
        }

        return entry
      }, null)
    },
    readRoutes: async (options) => {
      return runOfflineNavigationCacheOperation(async () => {
        const buildId = getCacheBuildId(options?.buildId)
        if (buildId === null) {
          return []
        }

        const [entries, cacheVersion] = await Promise.all([
          storage.getRoutes(buildId),
          storage.getRouteCacheVersion(),
        ])
        const usableEntries: OfflineNavigationRouteRecord[] = []
        await Promise.all(
          entries.map(async (entry) => {
            if (
              isUsableRouteRecord(
                entry,
                buildId,
                entry.key,
                cacheVersion,
                options
              )
            ) {
              usableEntries.push(entry)
            } else {
              if (
                typeof entry.buildId === 'string' &&
                typeof entry.key === 'string'
              ) {
                await storage.deleteRoute([entry.buildId, entry.key])
              }
            }
          })
        )
        return usableEntries
      }, [])
    },
    writeRoute: async (entry) => {
      return runOfflineNavigationCacheOperation(async () => {
        const buildId = getCacheBuildId(entry.buildId)
        if (buildId === null) {
          return false
        }

        await storage.putRoute({
          version: ROUTE_RECORD_VERSION,
          kind: 'route',
          buildId,
          key: entry.key,
          cacheVersion: await storage.getRouteCacheVersion(),
          staleAt: entry.staleAt,
          route: entry.route,
          routeVaryPath: entry.routeVaryPath,
          tree: entry.tree,
          metadata: entry.metadata,
        })
        return true
      }, false)
    },
    deleteRoute: async (key, options) => {
      return runOfflineNavigationCacheOperation(async () => {
        const buildId = getCacheBuildId(options?.buildId)
        if (buildId === null) {
          return false
        }

        await storage.deleteRoute([buildId, key])
        return true
      }, false)
    },
    invalidateRoutes: async () => {
      return runOfflineNavigationCacheOperation(async () => {
        await storage.incrementRouteCacheVersion()
        return true
      }, false)
    },
    readSegment: async (key, options) => {
      return runOfflineNavigationCacheOperation(async () => {
        const buildId = getCacheBuildId(options?.buildId)
        if (buildId === null) {
          return null
        }

        const cacheKey: OfflineNavigationSegmentCacheKey = [buildId, key]
        const [entry, cacheVersion] = await Promise.all([
          storage.getSegment(cacheKey),
          storage.getSegmentCacheVersion(),
        ])
        if (!entry) {
          return null
        }

        if (
          !isUsableSegmentRecord(entry, buildId, key, cacheVersion, options)
        ) {
          await storage.deleteSegment(cacheKey)
          return null
        }

        return entry
      }, null)
    },
    readSegments: async (options) => {
      return runOfflineNavigationCacheOperation(async () => {
        const buildId = getCacheBuildId(options?.buildId)
        if (buildId === null) {
          return []
        }

        const [entries, cacheVersion] = await Promise.all([
          storage.getSegments(buildId),
          storage.getSegmentCacheVersion(),
        ])
        const usableEntries: OfflineNavigationSegmentRecord[] = []
        await Promise.all(
          entries.map(async (entry) => {
            if (
              isUsableSegmentRecord(
                entry,
                buildId,
                entry.key,
                cacheVersion,
                options
              )
            ) {
              usableEntries.push(entry)
            } else {
              if (
                typeof entry.buildId === 'string' &&
                typeof entry.key === 'string'
              ) {
                await storage.deleteSegment([entry.buildId, entry.key])
              }
            }
          })
        )
        return usableEntries
      }, [])
    },
    writeSegment: async (entry) => {
      return runOfflineNavigationCacheOperation(async () => {
        const buildId = getCacheBuildId(entry.buildId)
        if (buildId === null) {
          return false
        }

        await storage.putSegment({
          version: SEGMENT_RECORD_VERSION,
          kind: 'segment',
          buildId,
          key: entry.key,
          cacheVersion: await storage.getSegmentCacheVersion(),
          staleAt: entry.staleAt,
          segment: entry.segment,
          segmentVaryPath: entry.segmentVaryPath,
          payload: entry.payload,
        })
        return true
      }, false)
    },
    deleteSegment: async (key, options) => {
      return runOfflineNavigationCacheOperation(async () => {
        const buildId = getCacheBuildId(options?.buildId)
        if (buildId === null) {
          return false
        }

        await storage.deleteSegment([buildId, key])
        return true
      }, false)
    },
    invalidateSegments: async () => {
      return runOfflineNavigationCacheOperation(async () => {
        await storage.incrementSegmentCacheVersion()
        return true
      }, false)
    },
    deleteBuild: async (buildId) => {
      return runOfflineNavigationCacheOperation(async () => {
        const cacheBuildId = getCacheBuildId(buildId)
        if (cacheBuildId === null) {
          return false
        }

        await storage.deleteBuild(cacheBuildId)
        return true
      }, false)
    },
  }
}

function isUsableRouteRecord(
  entry: OfflineNavigationRouteRecord,
  buildId: string,
  key: string,
  cacheVersion: number,
  options: OfflineNavigationCacheReadOptions | undefined
): boolean {
  return (
    entry.version === ROUTE_RECORD_VERSION &&
    entry.kind === 'route' &&
    entry.buildId === buildId &&
    typeof entry.key === 'string' &&
    entry.key === key &&
    entry.cacheVersion === cacheVersion &&
    entry.staleAt > (options?.now ?? Date.now())
  )
}

function isUsableSegmentRecord(
  entry: OfflineNavigationSegmentRecord,
  buildId: string,
  key: string,
  cacheVersion: number,
  options: OfflineNavigationCacheReadOptions | undefined
): boolean {
  return (
    entry.version === SEGMENT_RECORD_VERSION &&
    entry.kind === 'segment' &&
    entry.buildId === buildId &&
    typeof entry.key === 'string' &&
    entry.key === key &&
    entry.cacheVersion === cacheVersion &&
    entry.staleAt > (options?.now ?? Date.now())
  )
}

export async function createOfflineNavigationRSCResponsePayload(
  response: Response,
  requestKind: OfflineNavigationRSCResponseRequestKind
): Promise<OfflineNavigationRSCResponsePayload> {
  // Response bodies are one-shot streams, but IndexedDB stores structured data.
  // Persist the body as an ArrayBuffer so a later hard reload can recreate a
  // Response and feed it through the same RSC decoder as a network prefetch.
  const clone = response.clone()
  return {
    version: RSC_RESPONSE_PAYLOAD_VERSION,
    kind: 'rsc-response',
    requestKind,
    body: await clone.arrayBuffer(),
  }
}

export function createOfflineNavigationRSCResponse(
  payload: OfflineNavigationRSCResponsePayload
): Response {
  return new Response(payload.body.slice(0))
}

export function isOfflineNavigationRSCResponsePayload(
  payload: unknown
): payload is OfflineNavigationRSCResponsePayload {
  if (payload === null || typeof payload !== 'object') {
    return false
  }

  const candidate = payload as Partial<OfflineNavigationRSCResponsePayload>
  return (
    candidate.version === RSC_RESPONSE_PAYLOAD_VERSION &&
    candidate.kind === 'rsc-response' &&
    candidate.requestKind === 'segment-prefetch' &&
    candidate.body instanceof ArrayBuffer
  )
}

function getCacheBuildId(buildId: string | undefined): string | null {
  const cacheBuildId = buildId ?? getNavigationBuildId()
  return cacheBuildId === '' ? null : cacheBuildId
}

async function runOfflineNavigationCacheOperation<T>(
  operation: () => Promise<T>,
  fallback: T
): Promise<T> {
  // Offline cache persistence must never affect normal navigation. Treat any
  // storage failure as a cache miss and let the router continue.
  try {
    return await operation()
  } catch {
    return fallback
  }
}

function getIndexedDB(): IDBFactory | null {
  return typeof indexedDB === 'undefined' ? null : indexedDB
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error())
  })
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error())
    transaction.onerror = () => reject(transaction.error ?? new Error())
  })
}

function ensureObjectStore(
  database: IDBDatabase,
  storeName: string,
  keyPath: string | string[]
): void {
  if (!database.objectStoreNames.contains(storeName)) {
    database.createObjectStore(storeName, { keyPath })
  }
}

async function deleteBuildEntriesFromObjectStore(
  store: IDBObjectStore,
  buildId: string
): Promise<void> {
  const cursorRequest = store.openCursor()
  await new Promise<void>((resolve, reject) => {
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (cursor === null) {
        resolve()
        return
      }

      if ((cursor.value as { buildId?: unknown }).buildId === buildId) {
        cursor.delete()
      }
      cursor.continue()
    }
    cursorRequest.onerror = () => reject(cursorRequest.error ?? new Error())
  })
}

class IndexedDBOfflineNavigationCacheStorage
  implements OfflineNavigationCacheStorage
{
  private databasePromise: Promise<IDBDatabase | null> | null = null

  async deleteBuild(buildId: string): Promise<void> {
    const database = await this.getDatabase()
    if (database === null) {
      throw new Error()
    }

    const transaction = database.transaction(
      [ROUTE_STORE_NAME, SEGMENT_STORE_NAME],
      'readwrite'
    )
    await Promise.all(
      [ROUTE_STORE_NAME, SEGMENT_STORE_NAME].map((storeName) =>
        deleteBuildEntriesFromObjectStore(
          transaction.objectStore(storeName),
          buildId
        )
      )
    )
    await waitForTransaction(transaction)
  }

  async getRoute(
    key: OfflineNavigationSegmentCacheKey
  ): Promise<OfflineNavigationRouteRecord | undefined> {
    return this.getFromStore(ROUTE_STORE_NAME, key)
  }

  async getRoutes(buildId: string): Promise<OfflineNavigationRouteRecord[]> {
    return this.getBuildEntriesFromStore(ROUTE_STORE_NAME, buildId)
  }

  async putRoute(entry: OfflineNavigationRouteRecord): Promise<void> {
    await this.putIntoStore(ROUTE_STORE_NAME, entry)
  }

  async deleteRoute(key: OfflineNavigationSegmentCacheKey): Promise<void> {
    await this.deleteFromStore(ROUTE_STORE_NAME, key)
  }

  async getRouteCacheVersion(): Promise<number> {
    return this.getCacheVersion(ROUTE_CACHE_VERSION_KEY)
  }

  async incrementRouteCacheVersion(): Promise<number> {
    return this.incrementCacheVersion(ROUTE_CACHE_VERSION_KEY)
  }

  async getSegment(
    key: OfflineNavigationSegmentCacheKey
  ): Promise<OfflineNavigationSegmentRecord | undefined> {
    return this.getFromStore(SEGMENT_STORE_NAME, key)
  }

  async getSegments(
    buildId: string
  ): Promise<OfflineNavigationSegmentRecord[]> {
    return this.getBuildEntriesFromStore(SEGMENT_STORE_NAME, buildId)
  }

  async putSegment(entry: OfflineNavigationSegmentRecord): Promise<void> {
    await this.putIntoStore(SEGMENT_STORE_NAME, entry)
  }

  async deleteSegment(key: OfflineNavigationSegmentCacheKey): Promise<void> {
    await this.deleteFromStore(SEGMENT_STORE_NAME, key)
  }

  async getSegmentCacheVersion(): Promise<number> {
    return this.getCacheVersion(SEGMENT_CACHE_VERSION_KEY)
  }

  async incrementSegmentCacheVersion(): Promise<number> {
    return this.incrementCacheVersion(SEGMENT_CACHE_VERSION_KEY)
  }

  private async getFromStore<T>(
    storeName: string,
    key: IDBValidKey | IDBKeyRange
  ): Promise<T | undefined> {
    const database = await this.getDatabase()
    if (database === null) {
      return undefined
    }

    return requestToPromise(
      database
        .transaction(storeName, 'readonly')
        .objectStore(storeName)
        .get(key)
    )
  }

  private async getBuildEntriesFromStore<T extends { buildId: string }>(
    storeName: string,
    buildId: string
  ): Promise<T[]> {
    const database = await this.getDatabase()
    if (database === null) {
      return []
    }

    const transaction = database.transaction(storeName, 'readonly')
    const store = transaction.objectStore(storeName)
    const cursorRequest = store.openCursor()
    const entries: T[] = []
    await new Promise<void>((resolve, reject) => {
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result
        if (cursor === null) {
          resolve()
          return
        }

        const entry = cursor.value as T
        if (entry.buildId === buildId) {
          entries.push(entry)
        }
        cursor.continue()
      }
      cursorRequest.onerror = () => reject(cursorRequest.error ?? new Error())
    })
    await waitForTransaction(transaction)
    return entries
  }

  private async putIntoStore(storeName: string, entry: unknown): Promise<void> {
    const database = await this.getDatabase()
    if (database === null) {
      throw new Error()
    }

    const transaction = database.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).put(entry)
    await waitForTransaction(transaction)
  }

  private async deleteFromStore(
    storeName: string,
    key: IDBValidKey | IDBKeyRange
  ): Promise<void> {
    const database = await this.getDatabase()
    if (database === null) {
      throw new Error()
    }

    const transaction = database.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).delete(key)
    await waitForTransaction(transaction)
  }

  private async getCacheVersion(key: string): Promise<number> {
    const database = await this.getDatabase()
    if (database === null) {
      return 0
    }

    const cacheVersion = await requestToPromise(
      database
        .transaction(METADATA_STORE_NAME, 'readonly')
        .objectStore(METADATA_STORE_NAME)
        .get(key)
    )
    return typeof cacheVersion === 'number' ? cacheVersion : 0
  }

  private async incrementCacheVersion(key: string): Promise<number> {
    const database = await this.getDatabase()
    if (database === null) {
      throw new Error()
    }

    const transaction = database.transaction(METADATA_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(METADATA_STORE_NAME)
    const cacheVersion = await requestToPromise(store.get(key))
    const nextCacheVersion =
      (typeof cacheVersion === 'number' ? cacheVersion : 0) + 1
    store.put(nextCacheVersion, key)
    await waitForTransaction(transaction)
    return nextCacheVersion
  }

  private async getDatabase(): Promise<IDBDatabase | null> {
    if (this.databasePromise === null) {
      this.databasePromise = this.openDatabase().catch((error) => {
        this.databasePromise = null
        throw error
      })
    }
    return this.databasePromise
  }

  private async openDatabase(): Promise<IDBDatabase | null> {
    const idb = getIndexedDB()
    if (idb === null) {
      return null
    }

    const request = idb.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      // The build id is part of every primary key so records from an older
      // deployment cannot be replayed into a newer client bundle.
      ensureObjectStore(database, ROUTE_STORE_NAME, ['buildId', 'key'])
      ensureObjectStore(database, SEGMENT_STORE_NAME, ['buildId', 'key'])
      if (!database.objectStoreNames.contains(METADATA_STORE_NAME)) {
        database.createObjectStore(METADATA_STORE_NAME)
      }
    }

    const database = await requestToPromise(request)
    database.onversionchange = () => {
      database.close()
      this.databasePromise = null
    }
    return database
  }
}

const offlineNavigationCacheStorage =
  new IndexedDBOfflineNavigationCacheStorage()
const offlineNavigationSegmentCachePersistence =
  createOfflineNavigationSegmentCachePersistence(offlineNavigationCacheStorage)

export const deleteOfflineNavigationCacheEntriesForBuild =
  offlineNavigationSegmentCachePersistence.deleteBuild
export const readOfflineNavigationRouteRecord =
  offlineNavigationSegmentCachePersistence.readRoute
export const readOfflineNavigationRouteRecords =
  offlineNavigationSegmentCachePersistence.readRoutes
export const writeOfflineNavigationRouteRecord =
  offlineNavigationSegmentCachePersistence.writeRoute
export const deleteOfflineNavigationRouteRecord =
  offlineNavigationSegmentCachePersistence.deleteRoute
export const invalidateOfflineNavigationRouteRecords =
  offlineNavigationSegmentCachePersistence.invalidateRoutes
export const readOfflineNavigationSegmentRecord =
  offlineNavigationSegmentCachePersistence.readSegment
export const readOfflineNavigationSegmentRecords =
  offlineNavigationSegmentCachePersistence.readSegments
export const writeOfflineNavigationSegmentRecord =
  offlineNavigationSegmentCachePersistence.writeSegment
export const deleteOfflineNavigationSegmentRecord =
  offlineNavigationSegmentCachePersistence.deleteSegment
export const invalidateOfflineNavigationSegmentRecords =
  offlineNavigationSegmentCachePersistence.invalidateSegments
