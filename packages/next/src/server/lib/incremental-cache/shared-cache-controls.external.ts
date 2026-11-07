import type { PrerenderManifest } from '../../../build'
import type { DeepReadonly } from '../../../shared/lib/deep-readonly'
import type { CacheControl } from '../cache-control'
import {
  getRouteCacheKey,
  isRouteCacheOwner,
  type ResponseCacheOwner,
} from '../route-cache-key'
import { normalizeLocalePath } from '../../../shared/lib/i18n/normalize-locale-path'
import { RouteKind } from '../../route-kind'
import { LRUCache } from '../lru-cache'

// Approximate retained cost of an entry beyond its route string (LRU node, map
// slot, string header and the cache control object), measured with typical
// routes. Counting it keeps the number of entries bounded even when routes are
// short.
export const ENTRY_OVERHEAD = 240

/**
 * Default size budget, in bytes, for the in-memory cache controls (~90k
 * typical route keys). Can be configured via the
 * `NEXT_PRIVATE_CACHE_CONTROLS_MAX_BYTES` environment variable, which must be
 * a plain positive integer.
 *
 * When a route is evicted, its cache control falls back to the prerender
 * manifest like after a server restart. Routes that aren't in the manifest use
 * the default revalidate of 1 second until their next regeneration stores
 * their cache control again. Until then, their `revalidate: false` and
 * `expire` are lost and responses carry no route Cache-Control header, as
 * after a restart.
 */
const DEFAULT_MAX_BYTES = 32 * 1024 * 1024

function getMaxBytes(): number {
  const value = process.env.NEXT_PRIVATE_CACHE_CONTROLS_MAX_BYTES
  // Only accept plain digits, so that a value such as `32MiB` or `1e6` uses the
  // default instead of being read as a budget of a few bytes.
  if (value && /^\d+$/.test(value)) {
    const maxBytes = Number(value)
    if (Number.isSafeInteger(maxBytes) && maxBytes > 0) return maxBytes
  }
  return DEFAULT_MAX_BYTES
}

function getEntrySize(route: string): number {
  return ENTRY_OVERHEAD + route.length
}

type CacheControlsCache = {
  lru: LRUCache<CacheControl>
  maxBytes: number
  warnOversized: (size: number) => void
}

function createCacheControlsCache(): CacheControlsCache {
  const maxBytes = getMaxBytes()

  let didWarnEvicted = false
  const lru = new LRUCache<CacheControl>(
    maxBytes,
    (_, route) => getEntrySize(route),
    () => {
      if (didWarnEvicted) return
      didWarnEvicted = true
      console.warn(
        `The cache controls of ISR routes exceeded ${maxBytes} bytes, so the least recently used routes use their build-time or default revalidate until they're regenerated. ` +
          `Consider increasing NEXT_PRIVATE_CACHE_CONTROLS_MAX_BYTES.`
      )
    }
  )

  let didWarnOversized = false
  const warnOversized = (size: number) => {
    if (didWarnOversized) return
    didWarnOversized = true
    console.warn(
      `The cache control of an ISR route needs ${size} bytes, more than the whole NEXT_PRIVATE_CACHE_CONTROLS_MAX_BYTES budget of ${maxBytes} bytes, so it isn't stored and routes this long always use their build-time or default revalidate. ` +
        `Increase NEXT_PRIVATE_CACHE_CONTROLS_MAX_BYTES, or unset it to use the default budget.`
    )
  }

  return { lru, maxBytes, warnOversized }
}

// The route may be a slice of a longer string such as the request URL, which a
// sliced string retains for as long as it's stored. The JSON round-trip returns
// an equal, flat string for every input.
function flatKeyCopy(key: string): string {
  return JSON.parse(JSON.stringify(key))
}

/**
 * A shared cache of cache controls for routes. This cache is used so we don't
 * have to modify the prerender manifest when we want to update the cache
 * control for a route.
 */
export class SharedCacheControls {
  /**
   * The in-memory cache of cache lives for routes. This cache is populated when
   * the cache is updated with new cache lives. It's bounded, so routes that
   * haven't been read or written recently are evicted, see
   * `DEFAULT_MAX_BYTES`.
   */
  private static cacheControls = createCacheControlsCache()

  constructor(
    /**
     * The prerender manifest that contains the initial cache controls for
     * routes.
     */
    private readonly prerenderManifest: DeepReadonly<
      Pick<PrerenderManifest, 'routes' | 'dynamicRoutes'>
    >,
    private readonly locales?: readonly string[]
  ) {}

  /**
   * Try to get the cache control value for a route. This will first try to get
   * the value from the in-memory cache. If the value is not present in the
   * in-memory cache, it will be sourced from the prerender manifest.
   *
   * @param route the route to get the cache control for
   * @param owner the source route that owns the response
   * @returns the cache control for the route, or undefined if the values
   *          are not present in the in-memory cache or the prerender manifest
   */
  public get(
    route: string,
    owner: ResponseCacheOwner
  ): CacheControl | undefined {
    // This is a copy on write cache that is updated when the cache is updated.
    // If the cache is never written to, then the values will be sourced from
    // the prerender manifest.
    let cacheControl = SharedCacheControls.cacheControls.lru.get(
      getRouteCacheKey(route, owner)
    )
    if (cacheControl) return cacheControl

    let prerenderData = this.prerenderManifest.routes[route]

    if (
      prerenderData &&
      isRouteCacheOwner(route, owner, prerenderData, this.locales)
    ) {
      const { initialRevalidateSeconds, initialExpireSeconds } = prerenderData

      if (typeof initialRevalidateSeconds !== 'undefined') {
        return {
          revalidate: initialRevalidateSeconds,
          expire: initialExpireSeconds,
        }
      }
    }

    const dynamicPathname =
      owner.kind === RouteKind.PAGES
        ? normalizeLocalePath(route, this.locales).pathname
        : route
    const dynamicPrerenderData =
      this.prerenderManifest.dynamicRoutes[dynamicPathname]

    if (
      dynamicPrerenderData &&
      isRouteCacheOwner(route, owner, dynamicPrerenderData, this.locales)
    ) {
      const { fallbackRevalidate, fallbackExpire } = dynamicPrerenderData

      if (typeof fallbackRevalidate !== 'undefined') {
        return { revalidate: fallbackRevalidate, expire: fallbackExpire }
      }
    }

    // A new runtime pathname has no initial lifetime. Its own render supplies
    // one instead of borrowing a sibling route's build-time metadata.
    return undefined
  }

  /**
   * Set the cache control for a route.
   *
   * @param route the route to set the cache control for
   * @param cacheControl the cache control for the route
   */
  public set(route: string, cacheControl: CacheControl) {
    const cache = SharedCacheControls.cacheControls
    // The LRU cache would reject an entry larger than the whole budget with a
    // generic warning on every write, so skip it here and explain it once.
    const size = getEntrySize(route)
    if (size > cache.maxBytes) {
      cache.warnOversized(size)
      return
    }
    cache.lru.set(flatKeyCopy(route), cacheControl)
  }

  /**
   * Clear the in-memory cache of cache controls for routes.
   */
  public clear() {
    SharedCacheControls.cacheControls = createCacheControlsCache()
  }
}
