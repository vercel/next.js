import { DetachedPromise } from '../../lib/detached-promise'
import type { ResponseCacheEntry, ResponseGenerator } from './types'

/**
 * In the web server, there is currently no incremental cache provided and we
 * always SSR the page.
 */
export default class WebResponseCache {
  pendingResponses: Map<string, Promise<ResponseCacheEntry | null>>
  previousCacheItem?: {
    key: string
    entry: ResponseCacheEntry | null
    expiresAt: number
  }
  minimalMode?: boolean

  constructor(minimalMode: boolean) {
    this.pendingResponses = new Map()
    // this is a hack to avoid Webpack knowing this is equal to this.minimalMode
    // because we replace this.minimalMode to true in production bundles.
    Object.assign(this, { minimalMode })
  }

  public get(
    key: string | null,
    responseGenerator: ResponseGenerator,
    context: {
      isOnDemandRevalidate?: boolean
      isPrefetch?: boolean
      incrementalCache: any
    }
  ): Promise<ResponseCacheEntry | null> {
    // ensure on-demand revalidate doesn't block normal requests
    const pendingResponseKey = key
      ? `${key}-${context.isOnDemandRevalidate ? '1' : '0'}`
      : null

    const pendingResponse = pendingResponseKey
      ? this.pendingResponses.get(pendingResponseKey)
      : null
    if (pendingResponse) {
      return pendingResponse
    }

    const {
      promise,
      resolve: resolver,
      reject: rejecter,
    } = new DetachedPromise<ResponseCacheEntry | null>()
    if (pendingResponseKey) {
      this.pendingResponses.set(pendingResponseKey, promise)
    }

    let hasResolved = false
    const resolve = (cacheEntry: ResponseCacheEntry | null) => {
      if (pendingResponseKey) {
        // Ensure all reads from the cache get the latest value.
        this.pendingResponses.set(
          pendingResponseKey,
          Promise.resolve(cacheEntry)
        )
      }
      if (!hasResolved) {
        hasResolved = true
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
      try {
        const cacheEntry = await responseGenerator({ hasResolved })
        const resolveValue =
          cacheEntry === null
            ? null
            : {
                ...cacheEntry,
                isMiss: true,
              }

        // for on-demand revalidate wait to resolve until cache is set
        if (!context.isOnDemandRevalidate) {
          resolve(resolveValue)
        }

        if (key && cacheEntry && cacheEntry.cacheControl) {
          this.previousCacheItem = {
            key: pendingResponseKey || key,
            entry: cacheEntry,
            expiresAt: Date.now() + 1000,
          }
        } else {
          this.previousCacheItem = undefined
        }

        if (context.isOnDemandRevalidate) {
          resolve(resolveValue)
        }
      } catch (err) {
        // while revalidating in the background we can't reject as
        // we already resolved the cache entry so log the error here
        if (hasResolved) {
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
