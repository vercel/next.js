import {
  type IncrementalCache,
  type ResponseCacheEntry,
  type ResponseGenerator,
  type IncrementalCacheItem,
  type ResponseCacheBase,
  CachedRouteKind,
} from './types'

import { Batcher } from '../../lib/batcher'
import { scheduleOnNextTick } from '../../lib/scheduler'
import {
  fromResponseCacheEntry,
  routeKindToIncrementalCacheKind,
  toResponseCacheEntry,
} from './utils'
import type { RouteKind } from '../route-kind'

export * from './types'

export default class ResponseCache implements ResponseCacheBase {
  private readonly batcher = Batcher.create<
    { key: string; isOnDemandRevalidate: boolean },
    IncrementalCacheItem | null,
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
    entry: IncrementalCacheItem | null
    expiresAt: number
  }

  private minimalMode?: boolean

  constructor(minimalMode: boolean) {
    // this is a hack to avoid Webpack knowing this is equal to this.minimalMode
    // because we replace this.minimalMode to true in production bundles.
    const minimalModeKey = 'minimalMode'
    this[minimalModeKey] = minimalMode
  }

  public async get(
    key: string | null,
    responseGenerator: ResponseGenerator,
    context: {
      routeKind: RouteKind
      isOnDemandRevalidate?: boolean
      isPrefetch?: boolean
      incrementalCache: IncrementalCache
      isRoutePPREnabled?: boolean
      isFallback?: boolean
    }
  ): Promise<ResponseCacheEntry | null> {
    // If there is no key for the cache, we can't possibly look this up in the
    // cache so just return the result of the response generator.
    if (!key) {
      return responseGenerator({ hasResolved: false, previousCacheEntry: null })
    }

    const {
      incrementalCache,
      isOnDemandRevalidate = false,
      isFallback = false,
      isRoutePPREnabled = false,
    } = context

    const response = await this.batcher.batch(
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

        // Coerce the kindHint into a given kind for the incremental cache.
        const kind = routeKindToIncrementalCacheKind(context.routeKind)

        let resolved = false
        let cachedResponse: IncrementalCacheItem = null
        try {
          cachedResponse = !this.minimalMode
            ? await incrementalCache.get(key, {
                kind,
                isRoutePPREnabled: context.isRoutePPREnabled,
                isFallback,
              })
            : null

          if (cachedResponse && !isOnDemandRevalidate) {
            if (cachedResponse.value?.kind === CachedRouteKind.FETCH) {
              throw new Error(
                `invariant: unexpected cachedResponse of kind fetch in response cache`
              )
            }

            resolve({
              ...cachedResponse,
              revalidate: cachedResponse.curRevalidate,
            })
            resolved = true

            if (!cachedResponse.isStale || context.isPrefetch) {
              // The cached value is still valid, so we don't need
              // to update it yet.
              return null
            }
          }

          const cacheEntry = await responseGenerator({
            hasResolved: resolved,
            previousCacheEntry: cachedResponse,
            isRevalidating: true,
          })

          // If the cache entry couldn't be generated, we don't want to cache
          // the result.
          if (!cacheEntry) {
            // Unset the previous cache item if it was set.
            if (this.minimalMode) this.previousCacheItem = undefined
            return null
          }

          const resolveValue = await fromResponseCacheEntry({
            ...cacheEntry,
            isMiss: !cachedResponse,
          })
          if (!resolveValue) {
            // Unset the previous cache item if it was set.
            if (this.minimalMode) this.previousCacheItem = undefined
            return null
          }

          // For on-demand revalidate wait to resolve until cache is set.
          // Otherwise resolve now.
          if (!isOnDemandRevalidate && !resolved) {
            resolve(resolveValue)
            resolved = true
          }

          // We want to persist the result only if it has a revalidate value
          // defined.
          if (typeof resolveValue.revalidate !== 'undefined') {
            if (this.minimalMode) {
              this.previousCacheItem = {
                key: cacheKey,
                entry: resolveValue,
                expiresAt: Date.now() + 1000,
              }
            } else {
              await incrementalCache.set(key, resolveValue.value, {
                revalidate: resolveValue.revalidate,
                isRoutePPREnabled,
                isFallback,
              })
            }
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
              isRoutePPREnabled,
              isFallback,
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

    return toResponseCacheEntry(response)
  }
}
