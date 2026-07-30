import type { PrerenderManifest } from '../../../build'
import type { DeepReadonly } from '../../../shared/lib/deep-readonly'
import type { CacheControl } from '../cache-control'

import { removeVariantsPrefix } from '../../variants/prefix'

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
    >
  ) {}

  /**
   * Try to get the cache control value for a route. This will first try to get
   * the value from the in-memory cache. If the value is not present in the
   * in-memory cache, it will be sourced from the prerender manifest.
   *
   * @param route the route to get the cache control for
   * @returns the cache control for the route, or undefined if the values
   *          are not present in the in-memory cache or the prerender manifest
   */
  public get(route: string): CacheControl | undefined {
    // This is a copy on write cache that is updated when the cache is updated.
    // If the cache is never written to, then the values will be sourced from
    // the prerender manifest.
    let cacheControl = SharedCacheControls.cacheControls.get(route)
    if (cacheControl) return cacheControl

    // A variant combination is cached under its own key, so prefer a manifest
    // entry for that exact combination and fall back to the one for its route.
    //
    // Combinations can genuinely differ here: a variant value passed into a
    // `'use cache'` function can select a different `cacheLife`, which feeds
    // the route's effective lifetime. The fallback is therefore a narrowing,
    // and is only right while the manifest holds a single entry per route. It
    // becomes exact once the manifest carries an entry per combination, at
    // which point the first lookup wins and this stops being consulted.
    const prerenderData =
      this.prerenderManifest.routes[route] ??
      this.prerenderManifest.routes[removeVariantsPrefix(route)]

    if (prerenderData) {
      const { initialRevalidateSeconds, initialExpireSeconds } = prerenderData

      if (typeof initialRevalidateSeconds !== 'undefined') {
        return {
          revalidate: initialRevalidateSeconds,
          expire: initialExpireSeconds,
        }
      }
    }

    const dynamicPrerenderData =
      this.prerenderManifest.dynamicRoutes[route] ??
      this.prerenderManifest.dynamicRoutes[removeVariantsPrefix(route)]

    if (dynamicPrerenderData) {
      const { fallbackRevalidate, fallbackExpire } = dynamicPrerenderData

      if (typeof fallbackRevalidate !== 'undefined') {
        return { revalidate: fallbackRevalidate, expire: fallbackExpire }
      }
    }

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
