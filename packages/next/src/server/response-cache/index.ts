import type {
  IncrementalCache,
  ResponseCacheEntry,
  ResponseGenerator,
  IncrementalCacheItem,
} from './types'

import RenderResult from '../render-result'
import { Batcher } from '../../lib/batcher'
import { scheduleOnNextTick } from '../lib/schedule-on-next-tick'

export * from './types'

export default class ResponseCache {
  private readonly batcher = Batcher.create<
    { key: string; isOnDemandRevalidate: boolean },
    ResponseCacheEntry | null,
    string
  >({
    // Ensure on-demand revalidate doesn't block normal requests, it should be
    // safe to run an on-demand revalidate for the same key as a normal request.
    cacheKeyFn: ({ key, isOnDemandRevalidate }) =>
      `${key}-${isOnDemandRevalidate ? '1' : '0'}`,
    // We wait to do any async work until after we've added our promise to
    // `pendingResponses` to ensure that any any other calls will reuse the
    // same promise until we've fully finished our work.
    schedulerFn: scheduleOnNextTick,
  })

  private previousCacheItem?: {
    key: string
    entry: ResponseCacheEntry | null
    expiresAt: number
  }

  private minimalMode?: boolean

  constructor(minimalMode: boolean) {
    // this is a hack to avoid Webpack knowing this is equal to this.minimalMode
    // because we replace this.minimalMode to true in production bundles.
    const minimalModeKey = 'minimalMode'
    this[minimalModeKey] = minimalMode
  }

  public get(
    key: string | null,
    responseGenerator: ResponseGenerator,
    context: {
      isOnDemandRevalidate?: boolean
      isPrefetch?: boolean
      incrementalCache: IncrementalCache
    }
  ): Promise<ResponseCacheEntry | null> {
    // If there is no key for the cache, we can't possibly look this up in the
    // cache so just return the result of the response generator.
    if (!key) return responseGenerator(false, null)

    const { incrementalCache, isOnDemandRevalidate = false } = context

    return this.batcher.batch(
      { key, isOnDemandRevalidate },
      async (cacheKey, resolve) => {
        // We keep the previous cache entry around to leverage when the
        // incremental cache is disabled in minimal mode.
        if (
          this.minimalMode &&
          this.previousCacheItem?.key === cacheKey &&
          this.previousCacheItem.expiresAt > Date.now()
        ) {
          return this.previousCacheItem.entry
        }

        let resolved = false
        let cachedResponse: IncrementalCacheItem = null
        try {
          cachedResponse = !this.minimalMode
            ? await incrementalCache.get(key)
            : null

          if (cachedResponse && !isOnDemandRevalidate) {
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
                      headers: cachedResponse.value.headers,
                      status: cachedResponse.value.status,
                    }
                  : cachedResponse.value,
            })
            resolved = true

            if (!cachedResponse.isStale || context.isPrefetch) {
              // The cached value is still valid, so we don't need
              // to update it yet.
              return null
            }
          }

          const cacheEntry = await responseGenerator(resolved, cachedResponse)
          const resolveValue =
            cacheEntry === null
              ? null
              : {
                  ...cacheEntry,
                  isMiss: !cachedResponse,
                }

          // For on-demand revalidate wait to resolve until cache is set.
          // Otherwise resolve now.
          if (!isOnDemandRevalidate && !resolved) {
            resolve(resolveValue)
            resolved = true
          }

          if (cacheEntry && typeof cacheEntry.revalidate !== 'undefined') {
            if (this.minimalMode) {
              this.previousCacheItem = {
                key: cacheKey,
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
                      headers: cacheEntry.value.headers,
                      status: cacheEntry.value.status,
                    }
                  : cacheEntry.value,
                {
                  revalidate: cacheEntry.revalidate,
                }
              )
            }
          } else {
            this.previousCacheItem = undefined
          }

          return resolveValue
        } catch (err) {
          // When a getStaticProps path is erroring we automatically re-set the
          // existing cache under a new expiration to prevent non-stop retrying.
          if (cachedResponse) {
            await incrementalCache.set(key, cachedResponse.value, {
              revalidate: Math.min(
                Math.max(cachedResponse.revalidate || 3, 3),
                30
              ),
            })
          }

          // While revalidating in the background we can't reject as we already
          // resolved the cache entry so log the error here.
          if (resolved) {
            console.error(err)
            return null
          }

          // We haven't resolved yet, so let's throw to indicate an error.
          throw err
        }
      }
    )
  }
}
