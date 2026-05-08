import { getNavigationBuildId } from '../../navigation-build-id'
import { normalizePathTrailingSlash } from '../../normalize-trailing-slash'

const DATABASE_NAME = 'next-offline-navigation-cache'
const DATABASE_VERSION = 1
const STORE_NAME = 'navigation-data'
const ENTRY_VERSION = 1
const RSC_RESPONSE_PAYLOAD_VERSION = 1

type OfflineNavigationCacheKey = [buildId: string, url: string]
type OfflineNavigationRSCResponseRequestKind =
  | 'navigation'
  | 'route-prefetch'
  | 'client-resume'
  | 'initial-load'

export type OfflineNavigationCacheEntry = {
  version: typeof ENTRY_VERSION
  kind: 'exact-url'
  buildId: string
  url: string
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
        const entry = await storage.get(key)
        if (!entry) {
          return null
        }

        if (
          entry.version !== ENTRY_VERSION ||
          entry.kind !== 'exact-url' ||
          entry.buildId !== buildId ||
          entry.url !== cacheUrl
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
