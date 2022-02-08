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

interface IncrementalCache {
  get: (key: string) => Promise<{
    revalidateAfter?: number | false
    curRevalidate?: number | false
    revalidate?: number | false
    value?: any | null
    isStale?: boolean
    isMiss?: boolean
  } | null>
  set: (key: string, data: any, revalidate?: number | false) => Promise<void>
}

export default class ResponseCache {
  incrementalCache: IncrementalCache
  pendingResponses: Map<string, Promise<ResponseCacheEntry | null>>

  constructor(incrementalCache: IncrementalCache) {
    this.incrementalCache = incrementalCache
    this.pendingResponses = new Map()
  }

  public get(
    key: string | null,
    responseGenerator: ResponseGenerator,
    context: { isManualRevalidate?: boolean }
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

    // We wait to do any async work until after we've added our promise to
    // `pendingResponses` to ensure that any any other calls will reuse the
    // same promise until we've fully finished our work.
    ;(async () => {
      try {
        const cachedResponse = key ? await this.incrementalCache.get(key) : null
        if (
          cachedResponse &&
          (!context.isManualRevalidate ||
            cachedResponse.revalidateAfter === false)
        ) {
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
      } catch (err) {
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
