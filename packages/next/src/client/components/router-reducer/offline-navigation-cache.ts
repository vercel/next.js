import { getNavigationBuildId } from '../../navigation-build-id'
import { normalizePathTrailingSlash } from '../../normalize-trailing-slash'

// Durable exact-URL RSC response storage for offline navigations. IndexedDB is
// used instead of the service worker CacheStorage because the router needs
// structured records tied to the current Next.js build.
const DATABASE_NAME = 'next-offline-navigation-cache'
const DATABASE_VERSION = 2
const STORE_NAME = 'navigation-data'
const METADATA_STORE_NAME = 'metadata'
const EXACT_URL_CACHE_EPOCH_KEY = 'exact-url-cache-epoch'
const ENTRY_VERSION = 2
const RSC_RESPONSE_PAYLOAD_VERSION = 1

type OfflineNavigationCacheKey = [buildId: string, url: string]
export type OfflineNavigationRSCResponseRequestKind =
  | 'navigation'
  | 'route-prefetch'
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

export type OfflineNavigationCacheStorage = {
  get(
    key: OfflineNavigationCacheKey
  ): Promise<OfflineNavigationCacheEntry | undefined>
  put(entry: OfflineNavigationCacheEntry): Promise<void>
  delete(key: OfflineNavigationCacheKey): Promise<void>
  deleteBuild(buildId: string): Promise<void>
  getCacheEpoch(): Promise<number>
  incrementCacheEpoch(): Promise<number>
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

class IndexedDBOfflineNavigationCacheStorage
  implements OfflineNavigationCacheStorage
{
  private databasePromise: Promise<IDBDatabase | null> | null = null

  async get(
    key: OfflineNavigationCacheKey
  ): Promise<OfflineNavigationCacheEntry | undefined> {
    const database = await this.getDatabase()
    if (database === null) {
      return undefined
    }

    return requestToPromise(
      database
        .transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .get(key)
    )
  }

  async put(entry: OfflineNavigationCacheEntry): Promise<void> {
    const database = await this.getDatabase()
    if (database === null) {
      throw new Error()
    }

    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(entry)
    await waitForTransaction(transaction)
  }

  async delete(key: OfflineNavigationCacheKey): Promise<void> {
    const database = await this.getDatabase()
    if (database === null) {
      throw new Error()
    }

    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).delete(key)
    await waitForTransaction(transaction)
  }

  async deleteBuild(buildId: string): Promise<void> {
    const database = await this.getDatabase()
    if (database === null) {
      throw new Error()
    }

    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
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
    const database = await this.getDatabase()
    if (database === null) {
      return 0
    }

    const epoch = await requestToPromise(
      database
        .transaction(METADATA_STORE_NAME, 'readonly')
        .objectStore(METADATA_STORE_NAME)
        .get(EXACT_URL_CACHE_EPOCH_KEY)
    )
    return typeof epoch === 'number' ? epoch : 0
  }

  async incrementCacheEpoch(): Promise<number> {
    const database = await this.getDatabase()
    if (database === null) {
      throw new Error()
    }

    const transaction = database.transaction(METADATA_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(METADATA_STORE_NAME)
    const epoch = await requestToPromise(store.get(EXACT_URL_CACHE_EPOCH_KEY))
    const nextEpoch = (typeof epoch === 'number' ? epoch : 0) + 1
    store.put(nextEpoch, EXACT_URL_CACHE_EPOCH_KEY)
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
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, {
          keyPath: ['buildId', 'url'],
        })
      }
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

const offlineNavigationCache = createOfflineNavigationCache(
  new IndexedDBOfflineNavigationCacheStorage()
)

export const readOfflineNavigationCacheEntry = offlineNavigationCache.read
export const writeOfflineNavigationCacheEntry = offlineNavigationCache.write
export const deleteOfflineNavigationCacheEntry = offlineNavigationCache.delete
export const deleteOfflineNavigationCacheEntriesForBuild =
  offlineNavigationCache.deleteBuild
export const invalidateOfflineNavigationCacheEntries =
  offlineNavigationCache.invalidate
