import { collectFallbackRouteParams } from '../../build/segment-config/app/app-segments'
import type { FallbackRouteParam } from '../../build/static-paths/types'
import { getRouteMatcher } from '../../shared/lib/router/utils/route-matcher'
import { getRouteRegex } from '../../shared/lib/router/utils/route-regex'
import type AppPageRouteModule from '../route-modules/app-page/module'

function getParamKeys(page: string) {
  const pattern = getRouteRegex(page)
  const matcher = getRouteMatcher(pattern)

  // Get the default list of allowed params.
  return Object.keys(matcher(page))
}

/**
 * An opaque fallback route params object. This is used to store the fallback
 * route params in a way that is not easily accessible to the client.
 */
export type OpaqueFallbackRouteParams = {
  /**
   * The sizes of the fallback route params.
   */
  readonly sizes: {
    /**
     * The number of fallback route params that contribute to the route
     * segments. These are fallback parameters that are associated with the
     * route segments and should be used to determine if the pathname for the
     * route should be considered dynamic.
     */
    readonly route: number

    /**
     * The number of fallback route params that contribute to the parallel route
     * segments. These are fallback parameters that are not associated with the
     * route segments and should not be used to determine if the pathname for
     * the route should be considered dynamic.
     */
    readonly parallel: number
  }

  /**
   * Whether the fallback route params include the specified key. This will also
   * include the keys associated with parallel route segments.
   *
   * @param key the key to check
   * @returns whether the fallback route params include the specified key
   */
  readonly has: (key: string) => boolean

  /**
   * Gets the value of the fallback route param for the specified key. This will
   * also include the values associated with parallel route segments.
   *
   * @param key the key to get the value for
   * @returns the value of the fallback route param for the specified key
   */
  readonly get: (key: string) => string | undefined

  /**
   * The iterator for the fallback route params. This will only include the keys
   * associated with the route segments, not the parallel route segments. This
   * is because the only use for this is to generate the postponed state keys
   * for replacement, yet the parallel route segments are not used in the static
   * render, so it won't exist in the postponed state.
   */
  readonly [Symbol.iterator]: () => IterableIterator<[string, string]>
}

/**
 * Creates an opaque fallback route params object from the fallback route params.
 *
 * @param fallbackRouteParams the fallback route params
 * @returns the opaque fallback route params
 */
export function createOpaqueFallbackRouteParams(
  fallbackRouteParams: readonly FallbackRouteParam[]
): OpaqueFallbackRouteParams | null {
  // If there are no fallback route params, we can return early.
  if (fallbackRouteParams.length === 0) return null

  // As we're creating unique keys for each of the dynamic route params, we only
  // need to generate a unique ID once per request because each of the keys will
  // be also be unique.
  const uniqueID = Math.random().toString(16).slice(2)

  const sizes = { route: 0, parallel: 0 }
  const keys = new Map<string, string>()

  for (const { paramName, isParallelRouteParam } of fallbackRouteParams) {
    // We need to track the sizes of the fallback route params to determine if
    // the render should be halted during static generation.
    if (isParallelRouteParam) sizes.parallel++
    else sizes.route++

    // Generate a unique key for the fallback route param, if this key is found
    // in the static output, it represents a bug in cache components.
    keys.set(paramName, `%%drp:${paramName}:${uniqueID}%%`)
  }

  return {
    sizes,
    has: keys.has.bind(keys),
    get: keys.get.bind(keys),
    *[Symbol.iterator](): IterableIterator<[string, string]> {
      for (const { paramName, isParallelRouteParam } of fallbackRouteParams) {
        // We only want to include the route segments, not the parallel route
        // segments.
        if (isParallelRouteParam) continue
        yield [paramName, keys.get(paramName)!]
      }
    },
  } satisfies OpaqueFallbackRouteParams
}

/**
 * Gets the fallback route params for a given page. This is an expensive
 * operation because it requires parsing the loader tree to extract the fallback
 * route params.
 *
 * @param page the page
 * @param routeModule the route module
 * @returns the opaque fallback route params
 */
export function getFallbackRouteParams(
  page: string,
  routeModule: AppPageRouteModule
) {
  // First, get the fallback route params based on the provided page.
  const unknownParamKeys = new Set(getParamKeys(page))

  // Then, we have to get the fallback route params from the segments that are
  // associated with parallel route segments.
  const fallbackRouteParams: FallbackRouteParam[] = []
  for (const fallbackRouteParam of collectFallbackRouteParams(routeModule)) {
    if (fallbackRouteParam.isParallelRouteParam) {
      // If this is a parallel route segment, we know it wasn't provided in the
      // page, so we can add it to the fallback route params.
      fallbackRouteParams.push(fallbackRouteParam)
    } else if (unknownParamKeys.has(fallbackRouteParam.paramName)) {
      // As this is a non-parallel route segment, and it exists in the unknown
      // param keys, we know it's a fallback route param.
      fallbackRouteParams.push(fallbackRouteParam)
    }
  }

  return createOpaqueFallbackRouteParams(fallbackRouteParams)
}
