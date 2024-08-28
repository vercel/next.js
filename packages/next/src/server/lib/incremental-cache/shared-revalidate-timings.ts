import type { PrerenderManifest } from '../../../build'
import type { DeepReadonly } from '../../../shared/lib/deep-readonly'
import type { Revalidate } from '../revalidate'

/**
 * A shared cache of revalidate timings for routes. This cache is used so we
 * don't have to modify the prerender manifest when we want to update the
 * revalidate timings for a route.
 */
export class SharedRevalidateTimings {
  /**
   * The in-memory cache of revalidate timings for routes. This cache is
   * populated when the cache is updated with new timings.
   */
  private static readonly timings = new Map<string, Revalidate>()

  constructor(
    /**
     * The prerender manifest that contains the initial revalidate timings for
     * routes.
     */
    private readonly prerenderManifest: DeepReadonly<
      Pick<PrerenderManifest, 'routes' | 'dynamicRoutes'>
    >
  ) {}

  /**
   * Try to get the revalidate timings for a route. This will first try to get
   * the timings from the in-memory cache. If the timings are not present in the
   * in-memory cache, then the timings will be sourced from the prerender
   * manifest.
   *
   * @param route the route to get the revalidate timings for
   * @returns the revalidate timings for the route, or undefined if the timings
   *          are not present in the in-memory cache or the prerender manifest
   */
  public get(route: string): Revalidate | undefined {
    // This is a copy on write cache that is updated when the cache is updated.
    // If the cache is never written to, then the timings will be sourced from
    // the prerender manifest.
    let revalidate = SharedRevalidateTimings.timings.get(route)
    if (typeof revalidate !== 'undefined') return revalidate

    revalidate = this.prerenderManifest.routes[route]?.initialRevalidateSeconds
    if (typeof revalidate !== 'undefined') return revalidate

    revalidate = this.prerenderManifest.dynamicRoutes[route]?.fallbackRevalidate
    if (typeof revalidate !== 'undefined') return revalidate

    return undefined
  }

  /**
   * Set the revalidate timings for a route.
   *
   * @param route the route to set the revalidate timings for
   * @param revalidate the revalidate timings for the route
   */
  public set(route: string, revalidate: Revalidate) {
    SharedRevalidateTimings.timings.set(route, revalidate)
  }

  /**
   * Clear the in-memory cache of revalidate timings for routes.
   */
  public clear() {
    SharedRevalidateTimings.timings.clear()
  }
}
