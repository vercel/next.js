import RenderResult from './render-result'

export interface CachedRedirectValue {
  kind: 'REDIRECT'
  props: Object
}

interface CachedPageValue {
  kind: 'PAGE'
  // this needs to be a RenderResult so since renderResponse
  // expects that type instead of a string
  html: RenderResult
  pageData: Object
}

export interface CachedImageValue {
  kind: 'IMAGE'
  etag: string
  buffer: Buffer
  extension: string
  isMiss?: boolean
  isStale?: boolean
}

interface IncrementalCachedPageValue {
  kind: 'PAGE'
  // this needs to be a string since the cache expects to store
  // the string value
  html: string
  pageData: Object
}

export type IncrementalCacheEntry = {
  curRevalidate?: number | false
  // milliseconds to revalidate after
  revalidateAfter: number | false
  isStale?: boolean
  value: IncrementalCacheValue | null
}

export type IncrementalCacheValue =
  | CachedRedirectValue
  | IncrementalCachedPageValue
  | CachedImageValue

export type ResponseCacheValue =
  | CachedRedirectValue
  | CachedPageValue
  | CachedImageValue

export type ResponseCacheEntry = {
  revalidate?: number | false
  value: ResponseCacheValue | null
  isStale?: boolean
  isMiss?: boolean
}

type ResponseGenerator = (
  hasResolved: boolean,
  hadCache: boolean
) => Promise<ResponseCacheEntry | null>

type IncrementalCacheItem = {
  revalidateAfter?: number | false
  curRevalidate?: number | false
  revalidate?: number | false
  value: IncrementalCacheValue | null
  isStale?: boolean
  isMiss?: boolean
} | null

interface IncrementalCache {
  get: (key: string) => Promise<IncrementalCacheItem>
  set: (
    key: string,
    data: IncrementalCacheValue | null,
    revalidate?: number | false
  ) => Promise<void>
}

export default class ResponseCache {
  incrementalCache: IncrementalCache
  pendingResponses: Map<string, Promise<ResponseCacheEntry | null>>
  previousCacheItem?: {
    key: string
    entry: ResponseCacheEntry | null
    expiresAt: number
  }
  minimalMode?: boolean

  constructor(incrementalCache: IncrementalCache, minimalMode: boolean) {
    this.incrementalCache = incrementalCache
    this.pendingResponses = new Map()
    this.minimalMode = minimalMode
  }

  public get(
    key: string | null,
    responseGenerator: ResponseGenerator,
    context: {
      isManualRevalidate?: boolean
    }
  ): Promise<ResponseCacheEntry | null> {
    const pendingResponse = key ? this.pendingResponses.get(key) : null
    if (pendingResponse) {
      return pendingResponse
    }

    let resolver: (cacheEntry: ResponseCacheEntry | null) => void = () => {}
    let rejecter: (error: Error) => void = () => {}
    const promise: Promise<ResponseCacheEntry | null> = new Promise(
      (resolve, reject) => {
        resolver = resolve
        rejecter = reject
      }
    )
    if (key) {
      this.pendingResponses.set(key, promise)
    }

    let resolved = false
    const resolve = (cacheEntry: ResponseCacheEntry | null) => {
      if (key) {
        // Ensure all reads from the cache get the latest value.
        this.pendingResponses.set(key, Promise.resolve(cacheEntry))
      }
      if (!resolved) {
        resolved = true
        resolver(cacheEntry)
      }
    }

    // we keep the previous cache entry around to leverage
    // when the incremental cache is disabled in minimal mode
    if (
      key &&
      this.minimalMode &&
      this.previousCacheItem?.key === key &&
      this.previousCacheItem.expiresAt > Date.now()
    ) {
      resolve(this.previousCacheItem.entry)
      this.pendingResponses.delete(key)
      return promise
    }

    // We wait to do any async work until after we've added our promise to
    // `pendingResponses` to ensure that any any other calls will reuse the
    // same promise until we've fully finished our work.
    ;(async () => {
      let cachedResponse: IncrementalCacheItem = null
      try {
        cachedResponse =
          key && !this.minimalMode ? await this.incrementalCache.get(key) : null

        if (cachedResponse && !context.isManualRevalidate) {
          resolve({
            isStale: cachedResponse.isStale,
            revalidate: cachedResponse.curRevalidate,
            value:
              cachedResponse.value?.kind === 'PAGE'
                ? {
                    kind: 'PAGE',
                    html: RenderResult.fromStatic(cachedResponse.value.html),
                    pageData: cachedResponse.value.pageData,
                  }
                : cachedResponse.value,
          })
          if (!cachedResponse.isStale) {
            // The cached value is still valid, so we don't need
            // to update it yet.
            return
          }
        }

        const cacheEntry = await responseGenerator(resolved, !!cachedResponse)
        resolve(
          cacheEntry === null
            ? null
            : {
                ...cacheEntry,
                isMiss: !cachedResponse,
              }
        )

        if (key && cacheEntry && typeof cacheEntry.revalidate !== 'undefined') {
          if (this.minimalMode) {
            this.previousCacheItem = {
              key,
              entry: cacheEntry,
              expiresAt: Date.now() + 1000,
            }
          } else {
            await this.incrementalCache.set(
              key,
              cacheEntry.value?.kind === 'PAGE'
                ? {
                    kind: 'PAGE',
                    html: cacheEntry.value.html.toUnchunkedString(),
                    pageData: cacheEntry.value.pageData,
                  }
                : cacheEntry.value,
              cacheEntry.revalidate
            )
          }
        } else {
          this.previousCacheItem = undefined
        }
      } catch (err) {
        // when a getStaticProps path is erroring we automatically re-set the
        // existing cache under a new expiration to prevent non-stop retrying
        if (cachedResponse && key) {
          await this.incrementalCache.set(
            key,
            cachedResponse.value,
            Math.min(Math.max(cachedResponse.revalidate || 3, 3), 30)
          )
        }
        // while revalidating in the background we can't reject as
        // we already resolved the cache entry so log the error here
        if (resolved) {
          console.error(err)
        } else {
          rejecter(err as Error)
        }
      } finally {
        if (key) {
          this.pendingResponses.delete(key)
        }
      }
    })()
    return promise
  }
}
