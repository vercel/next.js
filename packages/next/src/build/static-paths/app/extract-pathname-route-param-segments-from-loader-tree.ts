import type { LoaderTree } from '../../../server/lib/app-dir-module'
import type { Params } from '../../../server/request/params'
import type { DynamicParamTypes } from '../../../shared/lib/app-router-types'
import {
  parseAppRouteSegment,
  type NormalizedAppRoute,
  type NormalizedAppRouteSegment,
} from '../../../shared/lib/router/routes/app'
import { parseLoaderTree } from '../../../shared/lib/router/utils/parse-loader-tree'
import { resolveParamValue } from '../../../shared/lib/router/utils/resolve-param-value'

/**
 * Validates that the static segments in currentPath match the corresponding
 * segments in targetSegments. This ensures we only extract dynamic parameters
 * that are part of the target pathname structure.
 *
 * Segments are compared literally - interception markers like "(.)photo" are
 * part of the pathname and must match exactly.
 *
 * @example
 * // Matching paths
 * currentPath: ['blog', '(.)photo']
 * targetSegments: ['blog', '(.)photo', '[id]']
 * → Returns true (both static segments match exactly)
 *
 * @example
 * // Non-matching paths
 * currentPath: ['blog', '(.)photo']
 * targetSegments: ['blog', 'photo', '[id]']
 * → Returns false (segments don't match - marker is part of pathname)
 *
 * @param currentPath - The accumulated path segments from the loader tree
 * @param targetSegments - The target pathname split into segments
 * @returns true if all static segments match, false otherwise
 */
function validatePrefixMatch(
  currentPath: NormalizedAppRouteSegment[],
  route: NormalizedAppRoute
): boolean {
  for (let i = 0; i < currentPath.length; i++) {
    const pathSegment = currentPath[i]
    const targetPathSegment = route.segments[i]

    // Type mismatch - one is static, one is dynamic
    if (pathSegment.type !== targetPathSegment.type) {
      return false
    }

    // One has an interception marker, the other doesn't.
    if (
      pathSegment.interceptionMarker !== targetPathSegment.interceptionMarker
    ) {
      return false
    }

    // Both are static but names don't match
    if (
      pathSegment.type === 'static' &&
      targetPathSegment.type === 'static' &&
      pathSegment.name !== targetPathSegment.name
    ) {
      return false
    }
    // Both are dynamic but param names don't match
    else if (
      pathSegment.type === 'dynamic' &&
      targetPathSegment.type === 'dynamic' &&
      pathSegment.param.paramType !== targetPathSegment.param.paramType &&
      pathSegment.param.paramName !== targetPathSegment.param.paramName
    ) {
      return false
    }
  }

  return true
}

/**
 * Extracts pathname route param segments from a loader tree and resolves
 * parameter values from static segments in the route.
 *
 * @param loaderTree - The loader tree structure containing route hierarchy
 * @param route - The target route to match against
 * @returns Object containing pathname route param segments and resolved params
 */
export function extractPathnameRouteParamSegmentsFromLoaderTree(
  loaderTree: LoaderTree,
  route: NormalizedAppRoute
): {
  pathnameRouteParamSegments: Array<{
    readonly name: string
    readonly paramName: string
    readonly paramType: DynamicParamTypes
  }>
  params: Params
} {
  const pathnameRouteParamSegments: Array<{
    readonly name: string
    readonly paramName: string
    readonly paramType: DynamicParamTypes
  }> = []
  const params: Params = {}

  // BFS traversal with depth and path tracking
  const queue: Array<{
    tree: LoaderTree
    depth: number
    currentPath: NormalizedAppRouteSegment[]
  }> = [{ tree: loaderTree, depth: 0, currentPath: [] }]

  while (queue.length > 0) {
    const { tree, depth, currentPath } = queue.shift()!
    const { segment, parallelRoutes } = parseLoaderTree(tree)

    // Build the path for the current node
    let updatedPath = currentPath
    let nextDepth = depth

    const appSegment = parseAppRouteSegment(segment)

    // Only add to path if it's a real segment that appears in the URL
    // Route groups and parallel markers don't contribute to URL pathname
    if (
      appSegment &&
      appSegment.type !== 'route-group' &&
      appSegment.type !== 'parallel-route'
    ) {
      updatedPath = [...currentPath, appSegment]
      nextDepth = depth + 1
    }

    // Check if this segment has a param and matches the target pathname at this depth
    if (appSegment?.type === 'dynamic') {
      const { paramName, paramType } = appSegment.param

      // Check if this segment is at the correct depth in the target pathname
      // A segment matches if:
      // 1. There's a dynamic segment at this depth in the pathname
      // 2. The parameter names match (e.g., [id] matches [id], not [category])
      // 3. The static segments leading up to this point match (prefix check)
      if (depth < route.segments.length) {
        const targetSegment = route.segments[depth]

        // Match if the target pathname has a dynamic segment at this depth
        if (targetSegment.type === 'dynamic') {
          // Check that parameter names match exactly
          // This prevents [category] from matching against /[id]
          if (paramName !== targetSegment.param.paramName) {
            continue // Different param names, skip this segment
          }

          // Validate that the path leading up to this dynamic segment matches
          // the target pathname. This prevents false matches like extracting
          // [slug] from "/news/[slug]" when the tree has "/blog/[slug]"
          if (validatePrefixMatch(currentPath, route)) {
            pathnameRouteParamSegments.push({
              name: segment,
              paramName,
              paramType,
            })
          }
        }
      }

      // Resolve parameter value if it's not already known.
      if (!params.hasOwnProperty(paramName)) {
        const paramValue = resolveParamValue(
          paramName,
          paramType,
          depth,
          route,
          params
        )

        if (paramValue !== undefined) {
          params[paramName] = paramValue
        }
      }
    }

    // Continue traversing all parallel routes to find matching segments
    for (const parallelRoute of Object.values(parallelRoutes)) {
      queue.push({
        tree: parallelRoute,
        depth: nextDepth,
        currentPath: updatedPath,
      })
    }
  }

  return { pathnameRouteParamSegments, params }
}
