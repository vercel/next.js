import type {
  ResponseCacheEntry,
  ResponseGenerator,
  ResponseCacheBase,
  IncrementalResponseCacheEntry,
  IncrementalResponseCache,
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
    IncrementalResponseCacheEntry | null,
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
    entry: IncrementalResponseCacheEntry | null
    expiresAt: number
  }

  // we don't use minimal_mode name here as this.minimal_mode is
  // statically replace for server runtimes but we need it to
  // be dynamic here
  private minimal_mode?: boolean

  constructor(minimal_mode: boolean) {
    this.minimal_mode = minimal_mode
  }

  public async get(
    key: string | null,
    responseGenerator: ResponseGenerator,
    context: {
      routeKind: RouteKind
      isOnDemandRevalidate?: boolean
      isPrefetch?: boolean
      incrementalCache: IncrementalResponseCache
      isRoutePPREnabled?: boolean
      isFallback?: boolean
      waitUntil?: (prom: Promise<any>) => void
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
      waitUntil,
    } = context

    const response = await this.batcher.batch(
      { key, isOnDemandRevalidate },
      (cacheKey, resolve) => {
        const prom = (async () => {
          // We keep the previous cache entry around to leverage when the
          // incremental cache is disabled in minimal mode.
          if (
            this.minimal_mode &&
            this.previousCacheItem?.key === cacheKey &&
            this.previousCacheItem.expiresAt > Date.now()
          ) {
            return this.previousCacheItem.entry
          }

          // Coerce the kindHint into a given kind for the incremental cache.
          const kind = routeKindToIncrementalCacheKind(context.routeKind)

          let resolved = false
          let cachedResponse: IncrementalResponseCacheEntry | null = null
          try {
            cachedResponse = !this.minimal_mode
              ? await incrementalCache.get(key, {
                  kind,
                  isRoutePPREnabled: context.isRoutePPREnabled,
                  isFallback,
                })
              : null

            if (cachedResponse && !isOnDemandRevalidate) {
              resolve(cachedResponse)
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
              if (this.minimal_mode) this.previousCacheItem = undefined
              return null
            }

            const resolveValue = await fromResponseCacheEntry({
              ...cacheEntry,
              isMiss: !cachedResponse,
            })
            if (!resolveValue) {
              // Unset the previous cache item if it was set.
              if (this.minimal_mode) this.previousCacheItem = undefined
              return null
            }

            // For on-demand revalidate wait to resolve until cache is set.
            // Otherwise resolve now.
            if (!isOnDemandRevalidate && !resolved) {
              resolve(resolveValue)
              resolved = true
            }

            // We want to persist the result only if it has a cache control value
            // defined.
            if (resolveValue.cacheControl) {
              if (this.minimal_mode) {
                this.previousCacheItem = {
                  key: cacheKey,
                  entry: resolveValue,
                  expiresAt: Date.now() + 1000,
                }
              } else {
                await incrementalCache.set(key, resolveValue.value, {
                  cacheControl: resolveValue.cacheControl,
                  isRoutePPREnabled,
                  isFallback,
                })
              }
            }

            return resolveValue
          } catch (err) {
            // When a path is erroring we automatically re-set the existing cache
            // with new revalidate and expire times to prevent non-stop retrying.
            if (cachedResponse?.cacheControl) {
              const newRevalidate = Math.min(
                Math.max(cachedResponse.cacheControl.revalidate || 3, 3),
                30
              )

              const newExpire =
                cachedResponse.cacheControl.expire === undefined
                  ? undefined
                  : Math.max(
                      newRevalidate + 3,
                      cachedResponse.cacheControl.expire
                    )

              await incrementalCache.set(key, cachedResponse.value, {
                cacheControl: { revalidate: newRevalidate, expire: newExpire },
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
        })()

        // we need to ensure background revalidates are
        // passed to waitUntil
        if (waitUntil) {
          waitUntil(prom)
        }
        return prom
      }
    )

    return toResponseCacheEntry(response)
  }
}
