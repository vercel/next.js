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

export type OpaqueFallbackRouteParams = ReadonlyMap<string, string>

/**
 * Creates an opaque fallback route params object from the fallback route params.
 *
 * @param fallbackRouteParams the fallback route params
 * @returns the opaque fallback route params
 */
export function createOpaqueFallbackRouteParams(
  fallbackRouteParams: readonly FallbackRouteParam[]
): OpaqueFallbackRouteParams | null {
  const keys: readonly string[] = fallbackRouteParams.map(
    ({ paramName }) => paramName
  )

  // If there are no keys, we can return early.
  if (keys.length === 0) return null

  const params = new Map<string, string>()

  // As we're creating unique keys for each of the dynamic route params, we only
  // need to generate a unique ID once per request because each of the keys will
  // be also be unique.
  const uniqueID = Math.random().toString(16).slice(2)

  for (const key of keys) {
    params.set(key, `%%drp:${key}:${uniqueID}%%`)
  }

  return params
}

/**
 * Gets the fallback route params for a given page.
 *
 * @param page the page
 * @param routeModule the route module
 * @returns the fallback route params
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

  return fallbackRouteParams
}
