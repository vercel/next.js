import { IncrementalCache } from './incremental-cache'

interface CachedRedirectValue {
  kind: 'REDIRECT'
  props: Object
}

interface CachedPageValue {
  kind: 'PAGE'
  html: string
  pageData: Object
}

export type ResponseCacheValue = CachedRedirectValue | CachedPageValue

export type ResponseCacheEntry = {
  revalidate?: number | false
  value: ResponseCacheValue | null
}

type ResponseGenerator = (
  hasResolved: boolean
) => Promise<[boolean, ResponseCacheEntry]>

export default class ResponseCache {
  incrementalCache: IncrementalCache
  pendingResponses: Map<string, Promise<ResponseCacheEntry>>

  constructor(incrementalCache: IncrementalCache) {
    this.incrementalCache = incrementalCache
    this.pendingResponses = new Map()
  }

  public get(
    key: string | null,
    responseGenerator: ResponseGenerator
  ): Promise<ResponseCacheEntry> {
    const pendingResponse = key ? this.pendingResponses.get(key) : null
    if (pendingResponse) {
      return pendingResponse
    }

    let response: Promise<ResponseCacheEntry> = new Promise(
      async (resolver, reject) => {
        try {
          let resolved = false
          const resolve = (cacheEntry: ResponseCacheEntry) => {
            if (!resolved) {
              resolved = true
              resolver(cacheEntry)
            }
          }

          // We wait to check the underlying cache, because we want this promise to be
          // added to `pendingResponses` synchronously, so there's only ever one pending
          // response in-flight for a given key.
          const cachedResponse = key
            ? await this.incrementalCache.get(key)
            : null
          if (cachedResponse) {
            resolve({
              revalidate: cachedResponse.curRevalidate,
              value: cachedResponse.value,
            })

            if (!cachedResponse.isStale) {
              // The cached value is still valid, so we don't need
              // to update it yet.
              return
            }
          }

          const [shouldCache, cacheEntry] = await responseGenerator(resolved)
          resolve(cacheEntry)

          if (key && shouldCache) {
            await this.incrementalCache.set(
              key,
              cacheEntry.value,
              cacheEntry.revalidate
            )
          }
        } catch (err) {
          reject(err)
        } finally {
          if (key) {
            this.pendingResponses.delete(key)
          }
        }
      }
    )

    if (key) {
      this.pendingResponses.set(key, response)
    }
    return response
  }
}
