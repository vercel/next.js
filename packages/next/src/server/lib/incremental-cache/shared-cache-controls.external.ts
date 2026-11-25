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

/**
 * A shared cache of cache controls for routes. This cache is used so we don't
 * have to modify the prerender manifest when we want to update the cache
 * control for a route.
 */
export class SharedCacheControls {
  /**
   * The in-memory cache of cache lives for routes. This cache is populated when
   * the cache is updated with new cache lives.
   */
  private static readonly cacheControls = new Map<string, CacheControl>()

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
    let cacheControl = SharedCacheControls.cacheControls.get(
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
    SharedCacheControls.cacheControls.set(route, cacheControl)
  }

  /**
   * Clear the in-memory cache of cache controls for routes.
   */
  public clear() {
    SharedCacheControls.cacheControls.clear()
  }
}
