import type {
  ResponseCacheEntry,
  ResponseGenerator,
  ResponseCacheBase,
  IncrementalResponseCacheEntry,
  IncrementalResponseCache,
} from './types'

import { Batcher } from '../../lib/batcher'
import { LRUCache } from '../lib/lru-cache'
import { warnOnce } from '../../build/output/log'
import { scheduleOnNextTick } from '../../lib/scheduler'
import {
  fromResponseCacheEntry,
  routeKindToIncrementalCacheKind,
  toResponseCacheEntry,
} from './utils'
import type { RouteKind } from '../route-kind'

export * from './types'

export default class ResponseCache implements ResponseCacheBase {
  private readonly getBatcher = Batcher.create<
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

  private readonly revalidateBatcher = Batcher.create<
    string,
    IncrementalResponseCacheEntry | null
  >({
    // We wait to do any async work until after we've added our promise to
    // `pendingResponses` to ensure that any any other calls will reuse the
    // same promise until we've fully finished our work.
    schedulerFn: scheduleOnNextTick,
  })

  /**
   * In-memory LRU cache for minimal mode. Automatically evicts least recently
   * used entries when capacity is reached.
   */
  private readonly previousCacheItems: LRUCache<{
    entry: IncrementalResponseCacheEntry | null
    invocationID: string | undefined
    /**
     * TTL expiration timestamp in milliseconds. Only set when invocationID is
     * undefined (non-Vercel providers that don't send x-vercel-id yet).
     * When invocationID exists, cache scoping is handled by invocationID
     * matching instead of TTL.
     */
    expiresAt: number | undefined
  }>

  /**
   * Set of invocation IDs that have had cache entries evicted.
   * Used to detect when the cache size may be too small.
   * Bounded to prevent memory growth.
   */
  private readonly evictedInvocationIDs: Set<string> = new Set()

  /**
   * The configured max cache size, stored for logging recommendations.
   */
  private readonly maxCacheSize: number

  // we don't use minimal_mode name here as this.minimal_mode is
  // statically replace for server runtimes but we need it to
  // be dynamic here
  private minimal_mode?: boolean

  constructor(minimal_mode: boolean, maxSize: number = 5) {
    this.minimal_mode = minimal_mode
    this.maxCacheSize = maxSize
    this.previousCacheItems = new LRUCache(
      maxSize,
      undefined,
      (_key, value) => {
        if (!value.invocationID) return

        // Bound to 100 entries to prevent memory growth
        if (this.evictedInvocationIDs.size >= 100) {
          const first = this.evictedInvocationIDs.values().next().value
          if (first) this.evictedInvocationIDs.delete(first)
        }
        this.evictedInvocationIDs.add(value.invocationID)
      }
    )
  }

  /**
   * Gets the response cache entry for the given key.
   *
   * @param key - The key to get the response cache entry for.
   * @param responseGenerator - The response generator to use to generate the response cache entry.
   * @param context - The context for the get request.
   * @returns The response cache entry.
   */
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

      /**
       * The invocation ID from the infrastructure. Used to scope the
       * in-memory cache to a single revalidation request in minimal mode.
       */
      invocationID?: string
    }
  ): Promise<ResponseCacheEntry | null> {
    // If there is no key for the cache, we can't possibly look this up in the
    // cache so just return the result of the response generator.
    if (!key) {
      return responseGenerator({
        hasResolved: false,
        previousCacheEntry: null,
      })
    }

    // Check minimal mode cache before doing any other work.
    if (this.minimal_mode) {
      const cachedItem = this.previousCacheItems.get(key)
      if (cachedItem) {
        // Cache hit validation uses two strategies based on environment:
        //
        // 1. Vercel (invocationID exists): Match by invocationID
        //    - Each serverless invocation gets isolated cache scope
        //    - Prevents cross-request cache pollution during revalidation
        //
        // 2. Other providers (invocationID undefined): Match by TTL expiration
        //    - Without invocationID, we can't scope by request
        //    - Use time-based expiration (10s) to prevent indefinite caching
        const invocationMatch =
          cachedItem.invocationID !== undefined &&
          cachedItem.invocationID === context.invocationID
        const ttlValid =
          cachedItem.invocationID === undefined &&
          cachedItem.expiresAt !== undefined &&
          cachedItem.expiresAt > Date.now()

        if (invocationMatch || ttlValid) {
          return toResponseCacheEntry(cachedItem.entry)
        }

        // Clean up expired TTL entries to prevent unbounded memory growth
        if (
          cachedItem.expiresAt !== undefined &&
          cachedItem.expiresAt <= Date.now()
        ) {
          this.previousCacheItems.remove(key)
        }
      }

      // Warn if this invocation had entries evicted - indicates cache may be too small
      if (
        context.invocationID &&
        this.evictedInvocationIDs.has(context.invocationID)
      ) {
        warnOnce(
          `Response cache entry was evicted for invocation ${context.invocationID}. ` +
            `Consider increasing \`experimental.maxResponseCacheSize\` (current: ${this.maxCacheSize}).`
        )
      }
    }

    const {
      incrementalCache,
      isOnDemandRevalidate = false,
      isFallback = false,
      isRoutePPREnabled = false,
      isPrefetch = false,
      waitUntil,
      routeKind,
      invocationID,
    } = context

    const response = await this.getBatcher.batch(
      { key, isOnDemandRevalidate },
      ({ resolve }) => {
        const promise = this.handleGet(
          key,
          responseGenerator,
          {
            incrementalCache,
            isOnDemandRevalidate,
            isFallback,
            isRoutePPREnabled,
            isPrefetch,
            routeKind,
            invocationID,
          },
          resolve
        )

        // We need to ensure background revalidates are passed to waitUntil.
        if (waitUntil) waitUntil(promise)

        return promise
      }
    )

    return toResponseCacheEntry(response)
  }

  /**
   * Handles the get request for the response cache.
   *
   * @param key - The key to get the response cache entry for.
   * @param responseGenerator - The response generator to use to generate the response cache entry.
   * @param context - The context for the get request.
   * @param resolve - The resolve function to use to resolve the response cache entry.
   * @returns The response cache entry.
   */
  private async handleGet(
    key: string,
    responseGenerator: ResponseGenerator,
    context: {
      incrementalCache: IncrementalResponseCache
      isOnDemandRevalidate: boolean
      isFallback: boolean
      isRoutePPREnabled: boolean
      isPrefetch: boolean
      routeKind: RouteKind
      invocationID: string | undefined
    },
    resolve: (value: IncrementalResponseCacheEntry | null) => void
  ): Promise<IncrementalResponseCacheEntry | null> {
    let previousIncrementalCacheEntry: IncrementalResponseCacheEntry | null =
      null
    let resolved = false

    try {
      // Get the previous cache entry if not in minimal mode
      previousIncrementalCacheEntry = !this.minimal_mode
        ? await context.incrementalCache.get(key, {
            kind: routeKindToIncrementalCacheKind(context.routeKind),
            isRoutePPREnabled: context.isRoutePPREnabled,
            isFallback: context.isFallback,
          })
        : null

      if (previousIncrementalCacheEntry && !context.isOnDemandRevalidate) {
        resolve(previousIncrementalCacheEntry)
        resolved = true

        if (!previousIncrementalCacheEntry.isStale || context.isPrefetch) {
          // The cached value is still valid, so we don't need to update it yet.
          return previousIncrementalCacheEntry
        }
      }

      // Revalidate the cache entry
      const incrementalResponseCacheEntry = await this.revalidate(
        key,
        context.incrementalCache,
        context.isRoutePPREnabled,
        context.isFallback,
        responseGenerator,
        previousIncrementalCacheEntry,
        previousIncrementalCacheEntry !== null && !context.isOnDemandRevalidate,
        undefined,
        context.invocationID
      )

      // Handle null response
      if (!incrementalResponseCacheEntry) {
        // Remove the cache item if it was set so we don't use it again.
        if (this.minimal_mode) {
          this.previousCacheItems.remove(key)
        }
        return null
      }

      return incrementalResponseCacheEntry
    } catch (err) {
      // If we've already resolved the cache entry, we can't reject as we
      // already resolved the cache entry so log the error here.
      if (resolved) {
        console.error(err)
        return null
      }

      throw err
    }
  }

  /**
   * Revalidates the cache entry for the given key.
   *
   * @param key - The key to revalidate the cache entry for.
   * @param incrementalCache - The incremental cache to use to revalidate the cache entry.
   * @param isRoutePPREnabled - Whether the route is PPR enabled.
   * @param isFallback - Whether the route is a fallback.
   * @param responseGenerator - The response generator to use to generate the response cache entry.
   * @param previousIncrementalCacheEntry - The previous cache entry to use to revalidate the cache entry.
   * @param hasResolved - Whether the response has been resolved.
   * @param waitUntil - Optional function to register background work.
   * @param invocationID - The invocation ID for cache key scoping.
   * @returns The revalidated cache entry.
   */
  public async revalidate(
    key: string,
    incrementalCache: IncrementalResponseCache,
    isRoutePPREnabled: boolean,
    isFallback: boolean,
    responseGenerator: ResponseGenerator,
    previousIncrementalCacheEntry: IncrementalResponseCacheEntry | null,
    hasResolved: boolean,
    waitUntil?: (prom: Promise<any>) => void,
    invocationID?: string
  ) {
    return this.revalidateBatcher.batch(key, () => {
      const promise = this.handleRevalidate(
        key,
        incrementalCache,
        isRoutePPREnabled,
        isFallback,
        responseGenerator,
        previousIncrementalCacheEntry,
        hasResolved,
        invocationID
      )

      // We need to ensure background revalidates are passed to waitUntil.
      if (waitUntil) waitUntil(promise)

      return promise
    })
  }

  private async handleRevalidate(
    key: string,
    incrementalCache: IncrementalResponseCache,
    isRoutePPREnabled: boolean,
    isFallback: boolean,
    responseGenerator: ResponseGenerator,
    previousIncrementalCacheEntry: IncrementalResponseCacheEntry | null,
    hasResolved: boolean,
    invocationID: string | undefined
  ) {
    try {
      // Generate the response cache entry using the response generator.
      const responseCacheEntry = await responseGenerator({
        hasResolved,
        previousCacheEntry: previousIncrementalCacheEntry,
        isRevalidating: true,
      })
      if (!responseCacheEntry) {
        return null
      }

      // Convert the response cache entry to an incremental response cache entry.
      const incrementalResponseCacheEntry = await fromResponseCacheEntry({
        ...responseCacheEntry,
        isMiss: !previousIncrementalCacheEntry,
      })

      // We want to persist the result only if it has a cache control value
      // defined.
      if (incrementalResponseCacheEntry.cacheControl) {
        if (this.minimal_mode) {
          // Set TTL expiration only when invocationID is undefined.
          // This handles non-Vercel providers that don't send x-vercel-id yet.
          // On Vercel, cache scoping is handled by invocationID matching, so TTL
          // is unnecessary.
          //
          // 10 second TTL chosen because:
          // - Long enough to dedupe rapid successive requests (e.g., page + data)
          // - Short enough to not serve stale data across unrelated requests
          // - Reasonable default until providers implement invocation IDs
          const expiresAt =
            invocationID === undefined ? Date.now() + 10_000 : undefined

          this.previousCacheItems.set(key, {
            entry: incrementalResponseCacheEntry,
            invocationID,
            expiresAt,
          })
        } else {
          await incrementalCache.set(key, incrementalResponseCacheEntry.value, {
            cacheControl: incrementalResponseCacheEntry.cacheControl,
            isRoutePPREnabled,
            isFallback,
          })
        }
      }

      return incrementalResponseCacheEntry
    } catch (err) {
      // When a path is erroring we automatically re-set the existing cache
      // with new revalidate and expire times to prevent non-stop retrying.
      if (previousIncrementalCacheEntry?.cacheControl) {
        const revalidate = Math.min(
          Math.max(
            previousIncrementalCacheEntry.cacheControl.revalidate || 3,
            3
          ),
          30
        )
        const expire =
          previousIncrementalCacheEntry.cacheControl.expire === undefined
            ? undefined
            : Math.max(
                revalidate + 3,
                previousIncrementalCacheEntry.cacheControl.expire
              )

        await incrementalCache.set(key, previousIncrementalCacheEntry.value, {
          cacheControl: { revalidate: revalidate, expire: expire },
          isRoutePPREnabled,
          isFallback,
        })
      }

      // We haven't resolved yet, so let's throw to indicate an error.
      throw err
    }
  }
}
