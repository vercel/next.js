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

/**
 * Default TTL (in milliseconds) for minimal mode response cache entries.
 * Used for cache hit validation as a fallback for providers that don't
 * send the x-invocation-id header yet.
 *
 * 10 seconds chosen because:
 * - Long enough to dedupe rapid successive requests (e.g., page + data)
 * - Short enough to not serve stale data across unrelated requests
 *
 * Can be configured via `experimental.responseCacheTTL` in next.config.js.
 */
const DEFAULT_TTL_MS = 10_000

/**
 * Default maximum number of pathnames to cache in the outer LRU cache.
 * Can be configured via `experimental.minimalModeResponseCacheMaxPaths`.
 */
const DEFAULT_MAX_PATHS = 30

/**
 * Default maximum number of invocations to cache per pathname in the inner LRU cache.
 * Can be configured via `experimental.minimalModeResponseCacheMaxInvocations`.
 */
const DEFAULT_MAX_INVOCATIONS_PER_PATH = 5

/**
 * Sentinel key used for TTL-based cache entries (when invocationID is undefined).
 * This allows TTL mode to use the same two-level cache structure as invocationID mode.
 */
const TTL_CACHE_KEY = '__ttl__'

/**
 * Entry stored in the inner (invocation-level) cache.
 */
type InvocationCacheEntry = {
  entry: IncrementalResponseCacheEntry | null
  /**
   * TTL expiration timestamp in milliseconds. Used as a fallback for
   * cache hit validation when providers don't send x-invocation-id.
   * Memory pressure is managed by LRU eviction rather than timers.
   */
  expiresAt: number
}

/**
 * Entry stored in the outer (path-level) cache.
 * Contains an inner LRU cache keyed by invocation ID.
 */
type PathCacheEntry = {
  invocations: LRUCache<InvocationCacheEntry>
}

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
   * Two-level LRU cache for minimal mode:
   * - Outer level: keyed by pathname, stores PathCacheEntry
   * - Inner level: keyed by invocationID (or TTL_CACHE_KEY), stores InvocationCacheEntry
   *
   * This structure allows multiple invocations to cache the same pathname
   * without overwriting each other's entries.
   */
  private readonly pathCache: LRUCache<PathCacheEntry>

  /**
   * Maximum number of invocations to cache per pathname.
   */
  private readonly maxInvocationsPerPath: number

  /**
   * Set of invocation IDs that have had cache entries evicted.
   * Used to detect when the cache size may be too small.
   * Bounded to prevent memory growth.
   */
  private readonly evictedInvocationIDs: Set<string> = new Set()

  /**
   * The configured max paths (number of pathnames to cache), stored for logging.
   */
  private readonly maxPaths: number

  /**
   * The configured TTL for cache entries in milliseconds.
   */
  private readonly ttl: number

  // we don't use minimal_mode name here as this.minimal_mode is
  // statically replace for server runtimes but we need it to
  // be dynamic here
  private minimal_mode?: boolean

  constructor(
    minimal_mode: boolean,
    maxPaths: number = DEFAULT_MAX_PATHS,
    maxInvocationsPerPath: number = DEFAULT_MAX_INVOCATIONS_PER_PATH,
    ttl: number = DEFAULT_TTL_MS
  ) {
    this.minimal_mode = minimal_mode
    this.maxPaths = maxPaths
    this.maxInvocationsPerPath = maxInvocationsPerPath
    this.ttl = ttl

    // Create the outer path-level cache
    this.pathCache = new LRUCache(maxPaths, undefined, (_key, pathEntry) => {
      // When a path is evicted, track all invocations that had entries
      for (const [innerKey] of pathEntry.invocations) {
        this.trackEvictedInvocation(innerKey)
      }
    })
  }

  /**
   * Gets or creates a PathCacheEntry for the given path.
   * This ensures the inner invocation cache exists before storing entries.
   */
  private getOrCreatePathEntry(path: string): PathCacheEntry {
    let pathEntry = this.pathCache.get(path)
    if (!pathEntry) {
      pathEntry = {
        invocations: new LRUCache(
          this.maxInvocationsPerPath,
          undefined,
          (innerKey) => this.trackEvictedInvocation(innerKey)
        ),
      }
      this.pathCache.set(path, pathEntry)
    }
    return pathEntry
  }

  /**
   * Tracks an evicted invocation ID for warning detection.
   * Uses FIFO eviction bounded to 100 entries to prevent unbounded memory growth.
   *
   * @param invocationID - The invocation ID that was evicted
   */
  private trackEvictedInvocation(invocationID: string): void {
    // Only track real invocation IDs, not the TTL sentinel
    if (invocationID === TTL_CACHE_KEY) return

    // Bound to 100 entries to prevent unbounded memory growth.
    // FIFO eviction is acceptable here because:
    // 1. Invocations are short-lived (single request lifecycle), so older
    //    invocations are unlikely to still be active after 100 newer ones
    // 2. This warning mechanism is best-effort for developer guidance—
    //    missing occasional eviction warnings doesn't affect correctness
    // 3. If a long-running invocation is somehow evicted and then has
    //    another cache entry evicted, it will simply be re-added
    if (this.evictedInvocationIDs.size >= 100) {
      const first = this.evictedInvocationIDs.values().next().value
      if (first) this.evictedInvocationIDs.delete(first)
    }
    this.evictedInvocationIDs.add(invocationID)
  }

  /**
   * Removes an invocation entry from the cache and cleans up empty path entries.
   *
   * @param key - The path key
   * @param innerKey - The invocation key (invocationID or TTL_CACHE_KEY)
   */
  private removeInvocationEntry(key: string, innerKey: string): void {
    const pathEntry = this.pathCache.get(key)
    if (!pathEntry) return

    pathEntry.invocations.remove(innerKey)
    // If inner cache is now empty, remove the path entry
    if (pathEntry.invocations.size === 0) {
      this.pathCache.remove(key)
    }
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
      const innerKey = context.invocationID ?? TTL_CACHE_KEY

      // Two-level lookup: first get the path entry, then the invocation entry
      const pathEntry = this.pathCache.get(key)
      const cachedItem = pathEntry?.invocations.get(innerKey)

      if (cachedItem) {
        // With two-level cache:
        // - INVOCATION_ID mode: Finding an entry by innerKey means exact match (always hit)
        // - TTL mode: Must check expiresAt validity
        if (context.invocationID !== undefined) {
          // Invocation mode: exact match found - always a hit
          return toResponseCacheEntry(cachedItem.entry)
        }

        // TTL mode: check expiration
        const now = Date.now()
        if (cachedItem.expiresAt > now) {
          return toResponseCacheEntry(cachedItem.entry)
        }

        // TTL expired - clean up
        this.removeInvocationEntry(key, innerKey)
      }

      // Warn if this invocation had entries evicted - indicates cache may be too small.
      // Eviction can happen at two levels:
      // 1. Path-level: too many unique pathnames (fix: increase minimalModeResponseCacheMaxPaths)
      // 2. Invocation-level: too many concurrent invocations per path (fix: increase minimalModeResponseCacheMaxInvocations)
      if (
        context.invocationID &&
        this.evictedInvocationIDs.has(context.invocationID)
      ) {
        warnOnce(
          `Response cache entry was evicted for invocation ${context.invocationID}. ` +
            `Consider increasing \`experimental.minimalModeResponseCacheMaxPaths\` (current: ${this.maxPaths}) ` +
            `or \`experimental.minimalModeResponseCacheMaxInvocations\` (current: ${this.maxInvocationsPerPath}).`
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
          const innerKey = context.invocationID ?? TTL_CACHE_KEY
          this.removeInvocationEntry(key, innerKey)
        }
        return null
      }

      // Resolve for on-demand revalidation or if not already resolved
      if (context.isOnDemandRevalidate && !resolved) {
        return incrementalResponseCacheEntry
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
          // Set TTL expiration for cache hit validation. Entries are validated
          // by invocationID when available, with TTL as a fallback for providers
          // that don't send x-invocation-id. Memory is managed by LRU eviction.
          const expiresAt = Date.now() + this.ttl
          const innerKey = invocationID ?? TTL_CACHE_KEY

          // Two-level store: get or create path entry, then store in inner cache
          const pathEntry = this.getOrCreatePathEntry(key)
          pathEntry.invocations.set(innerKey, {
            entry: incrementalResponseCacheEntry,
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
