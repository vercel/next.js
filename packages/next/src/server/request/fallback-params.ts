import { resolveRouteParamsFromTree } from '../../build/static-paths/utils'
import type { FallbackRouteParam } from '../../build/static-paths/types'
import type { DynamicParamTypesShort } from '../../shared/lib/app-router-types'
import { dynamicParamTypes } from '../app-render/get-short-dynamic-param-type'
import type AppPageRouteModule from '../route-modules/app-page/module'
import { parseAppRoute } from '../../shared/lib/router/routes/app'
import { extractPathnameRouteParamSegmentsFromLoaderTree } from '../../build/static-paths/app/extract-pathname-route-param-segments-from-loader-tree'

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
  const route = parseAppRoute(page, true)

  // Extract the pathname-contributing segments from the loader tree. This
  // mirrors the logic in buildAppStaticPaths where we determine which segments
  // actually contribute to the pathname.
  const { pathnameRouteParamSegments, params } =
    extractPathnameRouteParamSegmentsFromLoaderTree(
      routeModule.userland.loaderTree,
      route
    )

  // Create fallback route params for the pathname segments.
  const fallbackRouteParams: FallbackRouteParam[] =
    pathnameRouteParamSegments.map(({ paramName, paramType }) => ({
      paramName,
      paramType,
    }))

  // Resolve route params from the loader tree. This mutates the
  // fallbackRouteParams array to add any route params that are
  // unknown at request time.
  //
  // The page parameter contains placeholders like [slug], which helps
  // resolveRouteParamsFromTree determine which params are unknown.
  resolveRouteParamsFromTree(
    routeModule.userland.loaderTree,
    params, // Static params extracted from the page
    route, // The page pattern with placeholders
    fallbackRouteParams // Will be mutated to add route params
  )

  // Convert the fallback route params to an opaque format that can be safely
  // used in the postponed state without exposing implementation details.
  return createOpaqueFallbackRouteParams(fallbackRouteParams)
}
