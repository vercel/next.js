import type {
  IncrementalCache,
  ResponseCacheEntry,
  ResponseGenerator,
  IncrementalCacheItem,
} from './types'

import RenderResult from '../render-result'

export * from './types'

export default class ResponseCache {
  pendingResponses: Map<string, Promise<ResponseCacheEntry | null>>
  previousCacheItem?: {
    key: string
    entry: ResponseCacheEntry | null
    expiresAt: number
  }
  minimalMode?: boolean

  constructor(minimalMode: boolean) {
    this.pendingResponses = new Map()
    this.minimalMode = minimalMode
  }

  public get(
    key: string | null,
    responseGenerator: ResponseGenerator,
    context: {
      isManualRevalidate?: boolean
      isPrefetch?: boolean
      incrementalCache: IncrementalCache
    }
  ): Promise<ResponseCacheEntry | null> {
    const { incrementalCache } = context
    // ensure manual revalidate doesn't block normal requests
    const pendingResponseKey = key
      ? `${key}-${context.isManualRevalidate ? '1' : '0'}`
      : null

    const pendingResponse = pendingResponseKey
      ? this.pendingResponses.get(pendingResponseKey)
      : null

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
    if (pendingResponseKey) {
      this.pendingResponses.set(pendingResponseKey, promise)
    }

    let resolved = false
    const resolve = (cacheEntry: ResponseCacheEntry | null) => {
      if (pendingResponseKey) {
        // Ensure all reads from the cache get the latest value.
        this.pendingResponses.set(
          pendingResponseKey,
          Promise.resolve(cacheEntry)
        )
      }
      if (!resolved) {
        resolved = true
        resolver(cacheEntry)
      }
    }

    // we keep the previous cache entry around to leverage
    // when the incremental cache is disabled in minimal mode
    if (
      pendingResponseKey &&
      this.minimalMode &&
      this.previousCacheItem?.key === pendingResponseKey &&
      this.previousCacheItem.expiresAt > Date.now()
    ) {
      resolve(this.previousCacheItem.entry)
      this.pendingResponses.delete(pendingResponseKey)
      return promise
    }

    // We wait to do any async work until after we've added our promise to
    // `pendingResponses` to ensure that any any other calls will reuse the
    // same promise until we've fully finished our work.
    ;(async () => {
      let cachedResponse: IncrementalCacheItem = null
      try {
        cachedResponse =
          key && !this.minimalMode ? await incrementalCache.get(key) : null

        if (cachedResponse && !context.isManualRevalidate) {
          if (cachedResponse.value?.kind === 'FETCH') {
            throw new Error(
              `invariant: unexpected cachedResponse of kind fetch in response cache`
            )
          }

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
          if (!cachedResponse.isStale || context.isPrefetch) {
            // The cached value is still valid, so we don't need
            // to update it yet.
            return
          }
        }

        const cacheEntry = await responseGenerator(resolved, !!cachedResponse)
        const resolveValue =
          cacheEntry === null
            ? null
            : {
                ...cacheEntry,
                isMiss: !cachedResponse,
              }

        // for manual revalidate wait to resolve until cache is set
        if (!context.isManualRevalidate) {
          resolve(resolveValue)
        }

        if (key && cacheEntry && typeof cacheEntry.revalidate !== 'undefined') {
          if (this.minimalMode) {
            this.previousCacheItem = {
              key: pendingResponseKey || key,
              entry: cacheEntry,
              expiresAt: Date.now() + 1000,
            }
          } else {
            await incrementalCache.set(
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

        if (context.isManualRevalidate) {
          resolve(resolveValue)
        }
      } catch (err) {
        // when a getStaticProps path is erroring we automatically re-set the
        // existing cache under a new expiration to prevent non-stop retrying
        if (cachedResponse && key) {
          await incrementalCache.set(
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
        if (pendingResponseKey) {
          this.pendingResponses.delete(pendingResponseKey)
        }
      }
    })()
    return promise
  }
}
