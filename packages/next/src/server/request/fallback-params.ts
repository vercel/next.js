import { collectFallbackRouteParams } from '../../build/segment-config/app/app-segments'
import type { FallbackRouteParam } from '../../build/static-paths/types'
import type { DynamicParamTypesShort } from '../../shared/lib/app-router-types'
import { InvariantError } from '../../shared/lib/invariant-error'
import { getRouteMatcher } from '../../shared/lib/router/utils/route-matcher'
import { getRouteRegex } from '../../shared/lib/router/utils/route-regex'
import { dynamicParamTypes } from '../app-render/get-short-dynamic-param-type'
import type AppPageRouteModule from '../route-modules/app-page/module'

function getParamKeys(page: string) {
  const pattern = getRouteRegex(page)
  const matcher = getRouteMatcher(pattern)

  // Get the default list of allowed params.
  return Object.keys(matcher(page))
}

export type OpaqueFallbackRouteParamValue = [
  /**
   * The search value of the fallback route param. This is the opaque key
   * that will be used to replace the dynamic param in the postponed state.
   */
  searchValue: string,

  /**
   * The dynamic param type of the fallback route param. This is the type of
   * the dynamic param that will be used to replace the dynamic param in the
   * postponed state.
   */
  dynamicParamType: DynamicParamTypesShort,
]

/**
 * An opaque fallback route params object. This is used to store the fallback
 * route params in a way that is not easily accessible to the client.
 */
export type OpaqueFallbackRouteParams = ReadonlyMap<
  string,
  OpaqueFallbackRouteParamValue
>

/**
 * The entries of the opaque fallback route params object.
 *
 * @param key the key of the fallback route param
 * @param value the value of the fallback route param
 */
export type OpaqueFallbackRouteParamEntries =
  ReturnType<OpaqueFallbackRouteParams['entries']> extends MapIterator<
    [infer K, infer V]
  >
    ? ReadonlyArray<[K, V]>
    : never

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

  const keys = new Map<string, OpaqueFallbackRouteParamValue>()

  // Generate a unique key for the fallback route param, if this key is found
  // in the static output, it represents a bug in cache components.
  for (const { paramName, paramType } of fallbackRouteParams) {
    keys.set(paramName, [
      `%%drp:${paramName}:${uniqueID}%%`,
      dynamicParamTypes[paramType],
    ])
  }

  return keys
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

  // Needed when processing fallback route params for catchall routes in
  // parallel segments, derive from pathname. This is similar to
  // getDynamicParam's pagePath parsing logic.
  const pathSegments = page.split('/').filter(Boolean)

  const collected = collectFallbackRouteParams(routeModule)

  // Then, we have to get the fallback route params from the segments that are
  // associated with parallel route segments.
  const fallbackRouteParams: FallbackRouteParam[] = []
  for (const fallbackRouteParam of collected) {
    if (fallbackRouteParam.isParallelRouteParam) {
      // Try to see if we can resolve this parameter from the page that was
      // passed in.
      if (unknownParamKeys.has(fallbackRouteParam.paramName)) {
        // The parameter is known, we can skip adding it to the fallback route
        // params.
        continue
      }

      if (
        fallbackRouteParam.paramType === 'optional-catchall' ||
        fallbackRouteParam.paramType === 'catchall'
      ) {
        // If there are any fallback route segments then we can't use the
        // pathname to derive the value because it's not complete. We can
        // make this assumption because the routes are always resolved left
        // to right and the catchall is always the last segment, so any
        // route parameters that are unknown will always contribute to the
        // pathname and therefore the catchall param too.
        if (
          collected.some(
            (param) =>
              !param.isParallelRouteParam &&
              unknownParamKeys.has(param.paramName)
          )
        ) {
          fallbackRouteParams.push(fallbackRouteParam)
          continue
        }

        if (
          pathSegments.length === 0 &&
          fallbackRouteParam.paramType !== 'optional-catchall'
        ) {
          // We shouldn't be able to match a catchall segment without any path
          // segments if it's not an optional catchall.
          throw new InvariantError(
            `Unexpected empty path segments match for a pathname "${page}" with param "${fallbackRouteParam.paramName}" of type "${fallbackRouteParam.paramType}"`
          )
        }

        // The path segments are not empty, and the segments didn't contain any
        // unknown params, so we know that this particular fallback route param
        // route param is not actually unknown, and is known. We can skip adding
        // it to the fallback route params.
      } else {
        // This is some other type of route param that shouldn't get resolved
        // statically.
        throw new InvariantError(
          `Unexpected match for a pathname "${page}" with a param "${fallbackRouteParam.paramName}" of type "${fallbackRouteParam.paramType}"`
        )
      }
    } else if (unknownParamKeys.has(fallbackRouteParam.paramName)) {
      // As this is a non-parallel route segment, and it exists in the unknown
      // param keys, we know it's a fallback route param.
      fallbackRouteParams.push(fallbackRouteParam)
    }
  }

  return createOpaqueFallbackRouteParams(fallbackRouteParams)
}
