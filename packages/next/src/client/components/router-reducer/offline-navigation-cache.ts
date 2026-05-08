import { getNavigationBuildId } from '../../navigation-build-id'
import { normalizePathTrailingSlash } from '../../normalize-trailing-slash'

// Durable storage for offline navigations has two layers:
// 1. exact URL RSC responses, used to replay URLs the user has already loaded;
// 2. route and segment records, used to reconstruct prefetched routes.
//
// IndexedDB is used instead of the service worker CacheStorage because the
// router needs structured records, independent route and segment invalidation,
// and RSC response bodies tied to the current Next.js build.
const DATABASE_NAME = 'next-offline-navigation-cache'
const DATABASE_VERSION = 3
const EXACT_URL_STORE_NAME = 'navigation-data'
const ROUTE_STORE_NAME = 'route-data'
const SEGMENT_STORE_NAME = 'segment-data'
const METADATA_STORE_NAME = 'metadata'
const EXACT_URL_CACHE_EPOCH_KEY = 'exact-url-cache-epoch'
const ROUTE_CACHE_EPOCH_KEY = 'route-cache-epoch'
const SEGMENT_CACHE_EPOCH_KEY = 'segment-cache-epoch'
const ENTRY_VERSION = 2
const ROUTE_RECORD_VERSION = 1
const SEGMENT_RECORD_VERSION = 1
const RSC_RESPONSE_PAYLOAD_VERSION = 1

type OfflineNavigationCacheKey = [buildId: string, url: string]
type OfflineNavigationRouterCacheKey = [buildId: string, key: string]
export type OfflineNavigationRSCResponseRequestKind =
  | 'navigation'
  | 'route-prefetch'
  | 'segment-prefetch'
  | 'client-resume'
  | 'initial-load'

export type OfflineNavigationRSCResponseCacheSkipReason =
  | 'disabled'
  | 'dev-server'
  | 'not-production'
  | 'output-export'
  | 'unsupported-request'
  | 'missing-payload'
  | 'cross-origin'
  | 'unsupported-segment-prefetching'
  | 'runtime-prefetch'
  | 'partial-response'
  | 'hmr-refresh'
  | 'interception'
  | 'postponed'
  | 'redirected'

export type OfflineNavigationRSCResponseCacheEligibility = {
  requestKind: OfflineNavigationRSCResponseRequestKind | null
  url: string | URL
  origin?: string
  hasCachePayload?: boolean
  supportsPerSegmentPrefetching?: boolean
  hasRuntimePrefetch?: boolean
  hasPartialResponse?: boolean
  isHmrRefresh?: boolean
  isInterception?: boolean
  isPostponed?: boolean
  isRedirected?: boolean
}

export type OfflineNavigationCacheEntry = {
  version: typeof ENTRY_VERSION
  kind: 'exact-url'
  buildId: string
  url: string
  cacheEpoch: number
  createdAt: number
  staleAt: number
  expiresAt: number
  payload: unknown
}

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
  cacheEpoch: number
  createdAt: number
  staleAt: number
  expiresAt: number
  route: {
    pathname: string
    search: string
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
  cacheEpoch: number
  createdAt: number
  staleAt: number
  expiresAt: number
  segment: {
    requestKey: string
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
  url: string
  status: number
  statusText: string
  headers: Array<[string, string]>
  body: ArrayBuffer
}

export type OfflineNavigationCacheWrite = {
  url: string | URL
  staleAt: number
  expiresAt: number
  payload: unknown
  buildId?: string
  now?: number
}

export type OfflineNavigationCacheReadOptions = {
  buildId?: string
  now?: number
}

export type OfflineNavigationRSCResponseCacheWrite = {
  url: string | URL
  staleAt: number
  expiresAt: number
  buildId?: string
  now?: number
  payload: Promise<OfflineNavigationRSCResponsePayload | null>
}

export type OfflineNavigationRouteRecordWrite = Omit<
  OfflineNavigationRouteRecord,
  'buildId' | 'cacheEpoch' | 'createdAt' | 'kind' | 'version'
> & {
  buildId?: string
  now?: number
}

export type OfflineNavigationSegmentRecordWrite = Omit<
  OfflineNavigationSegmentRecord,
  'buildId' | 'cacheEpoch' | 'createdAt' | 'kind' | 'version'
> & {
  buildId?: string
  now?: number
}

export type OfflineNavigationCacheStorage = {
  get(
    key: OfflineNavigationCacheKey
  ): Promise<OfflineNavigationCacheEntry | undefined>
  put(entry: OfflineNavigationCacheEntry): Promise<void>
  delete(key: OfflineNavigationCacheKey): Promise<void>
  deleteBuild(buildId: string): Promise<void>
  getCacheEpoch(): Promise<number>
  incrementCacheEpoch(): Promise<number>
  getRoute(
    key: OfflineNavigationRouterCacheKey
  ): Promise<OfflineNavigationRouteRecord | undefined>
  getRoutes(buildId: string): Promise<OfflineNavigationRouteRecord[]>
  putRoute(entry: OfflineNavigationRouteRecord): Promise<void>
  deleteRoute(key: OfflineNavigationRouterCacheKey): Promise<void>
  getRouteCacheEpoch(): Promise<number>
  incrementRouteCacheEpoch(): Promise<number>
  getSegment(
    key: OfflineNavigationRouterCacheKey
  ): Promise<OfflineNavigationSegmentRecord | undefined>
  getSegments(buildId: string): Promise<OfflineNavigationSegmentRecord[]>
  putSegment(entry: OfflineNavigationSegmentRecord): Promise<void>
  deleteSegment(key: OfflineNavigationRouterCacheKey): Promise<void>
  getSegmentCacheEpoch(): Promise<number>
  incrementSegmentCacheEpoch(): Promise<number>
}

export type OfflineNavigationCache = {
  read: (
    url: string | URL,
    options?: OfflineNavigationCacheReadOptions
  ) => Promise<OfflineNavigationCacheEntry | null>
  write: (entry: OfflineNavigationCacheWrite) => Promise<boolean>
  delete: (
    url: string | URL,
    options?: OfflineNavigationCacheReadOptions
  ) => Promise<boolean>
  deleteBuild: (buildId?: string) => Promise<boolean>
  invalidate: () => Promise<boolean>
}

export type OfflineNavigationRouterCache = {
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
}

export function normalizeOfflineNavigationCacheUrl(url: string | URL): string {
  const normalized =
    typeof url === 'string'
      ? new URL(
          url,
          typeof window === 'undefined' ? undefined : window.location.href
        )
      : new URL(url.href)

  normalized.hash = ''
  normalized.pathname = normalizePathTrailingSlash(normalized.pathname)
  return normalized.href
}

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

export function createOfflineNavigationCache(
  storage: OfflineNavigationCacheStorage
): OfflineNavigationCache {
  return {
    read: async (url, options) => {
      return runOfflineNavigationCacheOperation(async () => {
        const buildId = getCacheBuildId(options?.buildId)
        if (buildId === null) {
          return null
        }

        const cacheUrl = normalizeOfflineNavigationCacheUrl(url)
        const key: OfflineNavigationCacheKey = [buildId, cacheUrl]
        const [entry, cacheEpoch] = await Promise.all([
          storage.get(key),
          storage.getCacheEpoch(),
        ])
        if (!entry) {
          return null
        }

        if (
          entry.version !== ENTRY_VERSION ||
          entry.kind !== 'exact-url' ||
          entry.buildId !== buildId ||
          entry.url !== cacheUrl ||
          entry.cacheEpoch !== cacheEpoch
        ) {
          await storage.delete(key)
          return null
        }

        if (entry.expiresAt <= (options?.now ?? Date.now())) {
          await storage.delete(key)
          return null
        }

        return entry
      }, null)
    },
    write: async (entry) => {
      return runOfflineNavigationCacheOperation(async () => {
        const buildId = getCacheBuildId(entry.buildId)
        if (buildId === null) {
          return false
        }

        await storage.put({
          version: ENTRY_VERSION,
          kind: 'exact-url',
          buildId,
          url: normalizeOfflineNavigationCacheUrl(entry.url),
          cacheEpoch: await storage.getCacheEpoch(),
          createdAt: entry.now ?? Date.now(),
          staleAt: entry.staleAt,
          expiresAt: entry.expiresAt,
          payload: entry.payload,
        })
        return true
      }, false)
    },
    delete: async (url, options) => {
      return runOfflineNavigationCacheOperation(async () => {
        const buildId = getCacheBuildId(options?.buildId)
        if (buildId === null) {
          return false
        }

        await storage.delete([buildId, normalizeOfflineNavigationCacheUrl(url)])
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
    invalidate: async () => {
      return runOfflineNavigationCacheOperation(async () => {
        await storage.incrementCacheEpoch()
        return true
      }, false)
    },
  }
}

export function createOfflineNavigationRouterCache(
  storage: OfflineNavigationCacheStorage
): OfflineNavigationRouterCache {
  return {
    readRoute: async (key, options) => {
      return runOfflineNavigationCacheOperation(async () => {
        const buildId = getCacheBuildId(options?.buildId)
        if (buildId === null) {
          return null
        }

        const cacheKey: OfflineNavigationRouterCacheKey = [buildId, key]
        const [entry, cacheEpoch] = await Promise.all([
          storage.getRoute(cacheKey),
          storage.getRouteCacheEpoch(),
        ])
        if (!entry) {
          return null
        }

        if (!isUsableRouteRecord(entry, buildId, key, cacheEpoch, options)) {
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

        const [entries, cacheEpoch] = await Promise.all([
          storage.getRoutes(buildId),
          storage.getRouteCacheEpoch(),
        ])
        const usableEntries: OfflineNavigationRouteRecord[] = []
        await Promise.all(
          entries.map(async (entry) => {
            if (
              isUsableRouteRecord(
                entry,
                buildId,
                entry.key,
                cacheEpoch,
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
          cacheEpoch: await storage.getRouteCacheEpoch(),
          createdAt: entry.now ?? Date.now(),
          staleAt: entry.staleAt,
          expiresAt: entry.expiresAt,
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
        await storage.incrementRouteCacheEpoch()
        return true
      }, false)
    },
    readSegment: async (key, options) => {
      return runOfflineNavigationCacheOperation(async () => {
        const buildId = getCacheBuildId(options?.buildId)
        if (buildId === null) {
          return null
        }

        const cacheKey: OfflineNavigationRouterCacheKey = [buildId, key]
        const [entry, cacheEpoch] = await Promise.all([
          storage.getSegment(cacheKey),
          storage.getSegmentCacheEpoch(),
        ])
        if (!entry) {
          return null
        }

        if (!isUsableSegmentRecord(entry, buildId, key, cacheEpoch, options)) {
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

        const [entries, cacheEpoch] = await Promise.all([
          storage.getSegments(buildId),
          storage.getSegmentCacheEpoch(),
        ])
        const usableEntries: OfflineNavigationSegmentRecord[] = []
        await Promise.all(
          entries.map(async (entry) => {
            if (
              isUsableSegmentRecord(
                entry,
                buildId,
                entry.key,
                cacheEpoch,
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
          cacheEpoch: await storage.getSegmentCacheEpoch(),
          createdAt: entry.now ?? Date.now(),
          staleAt: entry.staleAt,
          expiresAt: entry.expiresAt,
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
        await storage.incrementSegmentCacheEpoch()
        return true
      }, false)
    },
  }
}

function isUsableRouteRecord(
  entry: OfflineNavigationRouteRecord,
  buildId: string,
  key: string,
  cacheEpoch: number,
  options: OfflineNavigationCacheReadOptions | undefined
): boolean {
  return (
    entry.version === ROUTE_RECORD_VERSION &&
    entry.kind === 'route' &&
    entry.buildId === buildId &&
    typeof entry.key === 'string' &&
    entry.key === key &&
    entry.cacheEpoch === cacheEpoch &&
    entry.expiresAt > (options?.now ?? Date.now())
  )
}

function isUsableSegmentRecord(
  entry: OfflineNavigationSegmentRecord,
  buildId: string,
  key: string,
  cacheEpoch: number,
  options: OfflineNavigationCacheReadOptions | undefined
): boolean {
  return (
    entry.version === SEGMENT_RECORD_VERSION &&
    entry.kind === 'segment' &&
    entry.buildId === buildId &&
    typeof entry.key === 'string' &&
    entry.key === key &&
    entry.cacheEpoch === cacheEpoch &&
    entry.expiresAt > (options?.now ?? Date.now())
  )
}

export async function createOfflineNavigationRSCResponsePayload(
  response: Response,
  requestKind: OfflineNavigationRSCResponseRequestKind
): Promise<OfflineNavigationRSCResponsePayload> {
  const clone = response.clone()
  return {
    version: RSC_RESPONSE_PAYLOAD_VERSION,
    kind: 'rsc-response',
    requestKind,
    url: response.url,
    status: clone.status,
    statusText: clone.statusText,
    headers: Array.from(clone.headers.entries()),
    body: await clone.arrayBuffer(),
  }
}

export function createOfflineNavigationRSCResponse(
  payload: OfflineNavigationRSCResponsePayload
): Response {
  const response = new Response(payload.body.slice(0), {
    status: payload.status,
    statusText: payload.statusText,
    headers: payload.headers,
  })
  Object.defineProperty(response, 'url', { value: payload.url })
  return response
}

export function getOfflineNavigationRSCResponseCacheSkipReason({
  requestKind,
  url,
  origin,
  hasCachePayload = true,
  supportsPerSegmentPrefetching = true,
  hasRuntimePrefetch = false,
  hasPartialResponse = false,
  isHmrRefresh = false,
  isInterception = false,
  isPostponed = false,
  isRedirected = false,
}: OfflineNavigationRSCResponseCacheEligibility): OfflineNavigationRSCResponseCacheSkipReason | null {
  // Persist only response shapes the offline bootstrap can replay without
  // issuing follow-up network requests or guessing request context. This is
  // about replay completeness, not a privacy boundary; entries are still scoped
  // to the current browser profile and build.
  if (!process.env.__NEXT_OFFLINE_NAVIGATIONS) {
    return 'disabled'
  }

  if (process.env.__NEXT_DEV_SERVER) {
    return 'dev-server'
  }

  if (process.env.NODE_ENV !== 'production') {
    return 'not-production'
  }

  if (process.env.__NEXT_CONFIG_OUTPUT === 'export') {
    return 'output-export'
  }

  if (requestKind === null) {
    return 'unsupported-request'
  }

  if (!hasCachePayload) {
    return 'missing-payload'
  }

  const currentOrigin =
    origin ?? (typeof location === 'undefined' ? null : location.origin)
  if (
    currentOrigin !== null &&
    new URL(url, currentOrigin).origin !== currentOrigin
  ) {
    return 'cross-origin'
  }

  if (!supportsPerSegmentPrefetching && requestKind !== 'initial-load') {
    return 'unsupported-segment-prefetching'
  }

  if (hasRuntimePrefetch) {
    return 'runtime-prefetch'
  }

  if (hasPartialResponse) {
    return 'partial-response'
  }

  if (isHmrRefresh) {
    return 'hmr-refresh'
  }

  if (isInterception) {
    return 'interception'
  }

  if (isPostponed) {
    return 'postponed'
  }

  if (isRedirected) {
    return 'redirected'
  }

  return null
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
    (candidate.requestKind === 'navigation' ||
      candidate.requestKind === 'route-prefetch' ||
      candidate.requestKind === 'segment-prefetch' ||
      candidate.requestKind === 'client-resume' ||
      candidate.requestKind === 'initial-load') &&
    typeof candidate.url === 'string' &&
    typeof candidate.status === 'number' &&
    typeof candidate.statusText === 'string' &&
    Array.isArray(candidate.headers) &&
    candidate.body instanceof ArrayBuffer
  )
}

export async function writeOfflineNavigationRSCResponseCacheEntry({
  payload,
  ...entry
}: OfflineNavigationRSCResponseCacheWrite): Promise<boolean> {
  const resolvedPayload = await payload
  if (resolvedPayload === null) {
    return false
  }

  return writeOfflineNavigationCacheEntry({
    ...entry,
    payload: resolvedPayload,
  })
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

class IndexedDBOfflineNavigationCacheStorage
  implements OfflineNavigationCacheStorage
{
  private databasePromise: Promise<IDBDatabase | null> | null = null

  async get(
    key: OfflineNavigationCacheKey
  ): Promise<OfflineNavigationCacheEntry | undefined> {
    return this.getFromStore(EXACT_URL_STORE_NAME, key)
  }

  async put(entry: OfflineNavigationCacheEntry): Promise<void> {
    await this.putIntoStore(EXACT_URL_STORE_NAME, entry)
  }

  async delete(key: OfflineNavigationCacheKey): Promise<void> {
    await this.deleteFromStore(EXACT_URL_STORE_NAME, key)
  }

  async deleteBuild(buildId: string): Promise<void> {
    const database = await this.getDatabase()
    if (database === null) {
      throw new Error()
    }

    const transaction = database.transaction(EXACT_URL_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(EXACT_URL_STORE_NAME)
    const cursorRequest = store.openCursor()
    await new Promise<void>((resolve, reject) => {
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result
        if (cursor === null) {
          resolve()
          return
        }

        if ((cursor.value as OfflineNavigationCacheEntry).buildId === buildId) {
          cursor.delete()
        }
        cursor.continue()
      }
      cursorRequest.onerror = () => reject(cursorRequest.error ?? new Error())
    })
    await waitForTransaction(transaction)
  }

  async getCacheEpoch(): Promise<number> {
    return this.getEpoch(EXACT_URL_CACHE_EPOCH_KEY)
  }

  async incrementCacheEpoch(): Promise<number> {
    return this.incrementEpoch(EXACT_URL_CACHE_EPOCH_KEY)
  }

  async getRoute(
    key: OfflineNavigationRouterCacheKey
  ): Promise<OfflineNavigationRouteRecord | undefined> {
    return this.getFromStore(ROUTE_STORE_NAME, key)
  }

  async getRoutes(buildId: string): Promise<OfflineNavigationRouteRecord[]> {
    return this.getBuildEntriesFromStore(ROUTE_STORE_NAME, buildId)
  }

  async putRoute(entry: OfflineNavigationRouteRecord): Promise<void> {
    await this.putIntoStore(ROUTE_STORE_NAME, entry)
  }

  async deleteRoute(key: OfflineNavigationRouterCacheKey): Promise<void> {
    await this.deleteFromStore(ROUTE_STORE_NAME, key)
  }

  async getRouteCacheEpoch(): Promise<number> {
    return this.getEpoch(ROUTE_CACHE_EPOCH_KEY)
  }

  async incrementRouteCacheEpoch(): Promise<number> {
    return this.incrementEpoch(ROUTE_CACHE_EPOCH_KEY)
  }

  async getSegment(
    key: OfflineNavigationRouterCacheKey
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

  async deleteSegment(key: OfflineNavigationRouterCacheKey): Promise<void> {
    await this.deleteFromStore(SEGMENT_STORE_NAME, key)
  }

  async getSegmentCacheEpoch(): Promise<number> {
    return this.getEpoch(SEGMENT_CACHE_EPOCH_KEY)
  }

  async incrementSegmentCacheEpoch(): Promise<number> {
    return this.incrementEpoch(SEGMENT_CACHE_EPOCH_KEY)
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

  private async getEpoch(key: string): Promise<number> {
    const database = await this.getDatabase()
    if (database === null) {
      return 0
    }

    const epoch = await requestToPromise(
      database
        .transaction(METADATA_STORE_NAME, 'readonly')
        .objectStore(METADATA_STORE_NAME)
        .get(key)
    )
    return typeof epoch === 'number' ? epoch : 0
  }

  private async incrementEpoch(key: string): Promise<number> {
    const database = await this.getDatabase()
    if (database === null) {
      throw new Error()
    }

    const transaction = database.transaction(METADATA_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(METADATA_STORE_NAME)
    const epoch = await requestToPromise(store.get(key))
    const nextEpoch = (typeof epoch === 'number' ? epoch : 0) + 1
    store.put(nextEpoch, key)
    await waitForTransaction(transaction)
    return nextEpoch
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
      ensureObjectStore(database, EXACT_URL_STORE_NAME, ['buildId', 'url'])
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
const offlineNavigationCache = createOfflineNavigationCache(
  offlineNavigationCacheStorage
)
const offlineNavigationRouterCache = createOfflineNavigationRouterCache(
  offlineNavigationCacheStorage
)

export const readOfflineNavigationCacheEntry = offlineNavigationCache.read
export const writeOfflineNavigationCacheEntry = offlineNavigationCache.write
export const deleteOfflineNavigationCacheEntry = offlineNavigationCache.delete
export const deleteOfflineNavigationCacheEntriesForBuild =
  offlineNavigationCache.deleteBuild
export const invalidateOfflineNavigationCacheEntries =
  offlineNavigationCache.invalidate
export const readOfflineNavigationRouteRecord =
  offlineNavigationRouterCache.readRoute
export const readOfflineNavigationRouteRecords =
  offlineNavigationRouterCache.readRoutes
export const writeOfflineNavigationRouteRecord =
  offlineNavigationRouterCache.writeRoute
export const deleteOfflineNavigationRouteRecord =
  offlineNavigationRouterCache.deleteRoute
export const invalidateOfflineNavigationRouteRecords =
  offlineNavigationRouterCache.invalidateRoutes
export const readOfflineNavigationSegmentRecord =
  offlineNavigationRouterCache.readSegment
export const readOfflineNavigationSegmentRecords =
  offlineNavigationRouterCache.readSegments
export const writeOfflineNavigationSegmentRecord =
  offlineNavigationRouterCache.writeSegment
export const deleteOfflineNavigationSegmentRecord =
  offlineNavigationRouterCache.deleteSegment
export const invalidateOfflineNavigationSegmentRecords =
  offlineNavigationRouterCache.invalidateSegments
