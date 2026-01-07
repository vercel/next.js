import type { Params } from '../../../../server/request/params'
import type { DynamicParamTypes } from '../../app-router-types'
import { InvariantError } from '../../invariant-error'
import type {
  NormalizedAppRoute,
  NormalizedAppRouteSegment,
} from '../routes/app'
import { interceptionPrefixFromParamType } from './interception-prefix-from-param-type'

/**
 * Extracts the param value from a path segment, handling interception markers
 * based on the expected param type.
 *
 * @param pathSegment - The path segment to extract the value from
 * @param params - The current params object for resolving dynamic param references
 * @param paramType - The expected param type which may include interception marker info
 * @returns The extracted param value
 */
function getParamValueFromSegment(
  pathSegment: NormalizedAppRouteSegment,
  params: Params,
  paramType: DynamicParamTypes
): string {
  // If the segment is dynamic, resolve it from the params object
  if (pathSegment.type === 'dynamic') {
    return params[pathSegment.param.paramName] as string
  }

  // If the paramType indicates this is an intercepted param, strip the marker
  // that matches the interception marker in the param type
  const interceptionPrefix = interceptionPrefixFromParamType(paramType)
  if (interceptionPrefix === pathSegment.interceptionMarker) {
    return pathSegment.name.replace(pathSegment.interceptionMarker, '')
  }

  // For static segments, use the name
  return pathSegment.name
}

/**
 * Resolves a route parameter value from the route segments at the given depth.
 * This shared logic is used by both extractPathnameRouteParamSegmentsFromLoaderTree
 * and resolveRouteParamsFromTree.
 *
 * @param paramName - The parameter name to resolve
 * @param paramType - The parameter type (dynamic, catchall, etc.)
 * @param depth - The current depth in the route tree
 * @param route - The normalized route containing segments
 * @param params - The current params object (used to resolve embedded param references)
 * @param options - Configuration options
 * @returns The resolved parameter value, or undefined if it cannot be resolved
 */
export function resolveParamValue(
  paramName: string,
  paramType: DynamicParamTypes,
  depth: number,
  route: NormalizedAppRoute,
  params: Params
): string | string[] | undefined {
  switch (paramType) {
    case 'catchall':
    case 'optional-catchall':
    case 'catchall-intercepted-(..)(..)':
    case 'catchall-intercepted-(.)':
    case 'catchall-intercepted-(..)':
    case 'catchall-intercepted-(...)':
      // For catchall routes, derive from pathname using depth to determine
      // which segments to use
      const processedSegments: string[] = []

      // Process segments to handle any embedded dynamic params
      for (let index = depth; index < route.segments.length; index++) {
        const pathSegment = route.segments[index]

        if (pathSegment.type === 'static') {
          let value = pathSegment.name

          // For intercepted catch-all params, strip the marker from the first segment
          const interceptionPrefix = interceptionPrefixFromParamType(paramType)
          if (
            interceptionPrefix &&
            index === depth &&
            interceptionPrefix === pathSegment.interceptionMarker
          ) {
            // Strip the interception marker from the value
            value = value.replace(pathSegment.interceptionMarker, '')
          }

          processedSegments.push(value)
        } else {
          // If the segment is a param placeholder, check if we have its value
          if (!params.hasOwnProperty(pathSegment.param.paramName)) {
            // If the segment is an optional catchall, we can break out of the
            // loop because it's optional!
            if (pathSegment.param.paramType === 'optional-catchall') {
              break
            }

            // Unknown param placeholder in pathname - can't derive full value
            return undefined
          }

          // If the segment matches a param, use the param value
          // We don't encode values here as that's handled during retrieval.
          const paramValue = params[pathSegment.param.paramName]
          if (Array.isArray(paramValue)) {
            processedSegments.push(...paramValue)
          } else {
            processedSegments.push(paramValue as string)
          }
        }
      }

      if (processedSegments.length > 0) {
        return processedSegments
      } else if (paramType === 'optional-catchall') {
        return undefined
      } else {
        // We shouldn't be able to match a catchall segment without any path
        // segments if it's not an optional catchall
        throw new InvariantError(
          `Unexpected empty path segments match for a route "${route.pathname}" with param "${paramName}" of type "${paramType}"`
        )
      }
    case 'dynamic':
    case 'dynamic-intercepted-(..)(..)':
    case 'dynamic-intercepted-(.)':
    case 'dynamic-intercepted-(..)':
    case 'dynamic-intercepted-(...)':
      // For regular dynamic parameters, take the segment at this depth
      if (depth < route.segments.length) {
        const pathSegment = route.segments[depth]

        // Check if the segment at this depth is a placeholder for an unknown param
        if (
          pathSegment.type === 'dynamic' &&
          !params.hasOwnProperty(pathSegment.param.paramName)
        ) {
          // The segment is a placeholder like [category] and we don't have the value
          return undefined
        }

        // If the segment matches a param, use the param value from params object
        // Otherwise it's a static segment, just use it directly
        // We don't encode values here as that's handled during retrieval
        return getParamValueFromSegment(pathSegment, params, paramType)
      }

      return undefined

    default:
      paramType satisfies never
  }
}
