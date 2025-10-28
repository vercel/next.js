import type { DynamicParam } from '../../../../server/app-render/app-render'
import type { LoaderTree } from '../../../../server/lib/app-dir-module'
import type { OpaqueFallbackRouteParams } from '../../../../server/request/fallback-params'
import type { Params } from '../../../../server/request/params'
import type { DynamicParamTypesShort } from '../../app-router-types'
import { InvariantError } from '../../invariant-error'
import { parseLoaderTree } from './parse-loader-tree'
import { getSegmentParam } from './get-segment-param'

/**
 * Gets the value of a param from the params object. This correctly handles the
 * case where the param is a fallback route param and encodes the resulting
 * value.
 *
 * @param interpolatedParams - The params object.
 * @param segmentKey - The key of the segment.
 * @param fallbackRouteParams - The fallback route params.
 * @returns The value of the param.
 */
function getParamValue(
  interpolatedParams: Params,
  segmentKey: string,
  fallbackRouteParams: OpaqueFallbackRouteParams | null
) {
  let value = interpolatedParams[segmentKey]

  if (fallbackRouteParams?.has(segmentKey)) {
    // We know that the fallback route params has the segment key because we
    // checked that above.
    const [searchValue] = fallbackRouteParams.get(segmentKey)!
    value = searchValue
  } else if (Array.isArray(value)) {
    value = value.map((i) => encodeURIComponent(i))
  } else if (typeof value === 'string') {
    value = encodeURIComponent(value)
  }

  return value
}

export function interpolateParallelRouteParams(
  loaderTree: LoaderTree,
  params: Params,
  pagePath: string,
  fallbackRouteParams: OpaqueFallbackRouteParams | null
) {
  const interpolated = structuredClone(params)

  // Stack-based traversal with depth tracking
  const stack: Array<{ tree: LoaderTree; depth: number }> = [
    { tree: loaderTree, depth: 0 },
  ]

  // Derive value from pagePath based on depth and parameter type
  const pathSegments = pagePath.split('/').slice(1) // Remove first empty string

  while (stack.length > 0) {
    const { tree, depth } = stack.pop()!
    const { segment, parallelRoutes } = parseLoaderTree(tree)

    // Check if current segment contains a parameter
    const segmentParam = getSegmentParam(segment)
    if (
      segmentParam &&
      !interpolated.hasOwnProperty(segmentParam.param) &&
      // If the param is in the fallback route params, we don't need to
      // interpolate it because it's already marked as being unknown.
      !fallbackRouteParams?.has(segmentParam.param)
    ) {
      switch (segmentParam.type) {
        case 'catchall':
        case 'optional-catchall':
        case 'catchall-intercepted':
          // For catchall parameters, take all remaining segments from this depth
          const remainingSegments = pathSegments.slice(depth)

          // Process each segment to handle any dynamic params
          const processedSegments = remainingSegments
            .flatMap((pathSegment) => {
              const param = getSegmentParam(pathSegment)
              // If the segment matches a param, return the param value otherwise,
              // it's a static segment, so just return that. We don't use the
              // `getParamValue` function here because we don't want the values to
              // be encoded, that's handled on get by the `getDynamicParam`
              // function.
              return param ? interpolated[param.param] : pathSegment
            })
            .filter((s) => s !== undefined)

          if (processedSegments.length > 0) {
            interpolated[segmentParam.param] = processedSegments
          }
          break
        case 'dynamic':
        case 'dynamic-intercepted':
          // For regular dynamic parameters, take the segment at this depth
          if (depth < pathSegments.length) {
            const pathSegment = pathSegments[depth]
            const param = getSegmentParam(pathSegment)

            interpolated[segmentParam.param] = param
              ? interpolated[param.param]
              : pathSegment
          }
          break
        default:
          segmentParam.type satisfies never
      }
    }

    // Calculate next depth - increment if this is not a route group and not empty
    let nextDepth = depth
    const isRouteGroup = segment.startsWith('(') && segment.endsWith(')')
    if (!isRouteGroup && segment !== '') {
      nextDepth++
    }

    // Add all parallel routes to the stack for processing
    for (const route of Object.values(parallelRoutes)) {
      stack.push({ tree: route, depth: nextDepth })
    }
  }

  return interpolated
}

/**
 *
 * Shared logic on client and server for creating a dynamic param value.
 *
 * This code needs to be shared with the client so it can extract dynamic route
 * params from the URL without a server request.
 *
 * Because everything in this module is sent to the client, we should aim to
 * keep this code as simple as possible. The special case handling for catchall
 * and optional is, alas, unfortunate.
 */
export function getDynamicParam(
  interpolatedParams: Params,
  segmentKey: string,
  dynamicParamType: DynamicParamTypesShort,
  fallbackRouteParams: OpaqueFallbackRouteParams | null
): DynamicParam {
  let value: string | string[] | undefined = getParamValue(
    interpolatedParams,
    segmentKey,
    fallbackRouteParams
  )

  // handle the case where an optional catchall does not have a value,
  // e.g. `/dashboard/[[...slug]]` when requesting `/dashboard`
  if (!value || value.length === 0) {
    if (dynamicParamType === 'oc') {
      return {
        param: segmentKey,
        value: null,
        type: dynamicParamType,
        treeSegment: [segmentKey, '', dynamicParamType],
      }
    }

    throw new InvariantError(
      `Missing value for segment key: "${segmentKey}" with dynamic param type: ${dynamicParamType}`
    )
  }

  return {
    param: segmentKey,
    // The value that is passed to user code.
    value,
    // The value that is rendered in the router tree.
    treeSegment: [
      segmentKey,
      Array.isArray(value) ? value.join('/') : value,
      dynamicParamType,
    ],
    type: dynamicParamType,
  }
}

/**
 * Regular expression pattern used to match route parameters.
 * Matches both single parameters and parameter groups.
 * Examples:
 *   - `[[...slug]]` matches parameter group with key 'slug', repeat: true, optional: true
 *   - `[...slug]` matches parameter group with key 'slug', repeat: true, optional: false
 *   - `[[foo]]` matches parameter with key 'foo', repeat: false, optional: true
 *   - `[bar]` matches parameter with key 'bar', repeat: false, optional: false
 */
export const PARAMETER_PATTERN = /^([^[]*)\[((?:\[[^\]]*\])|[^\]]+)\](.*)$/

/**
 * Parses a given parameter from a route to a data structure that can be used
 * to generate the parametrized route.
 * Examples:
 *   - `[[...slug]]` -> `{ key: 'slug', repeat: true, optional: true }`
 *   - `[...slug]` -> `{ key: 'slug', repeat: true, optional: false }`
 *   - `[[foo]]` -> `{ key: 'foo', repeat: false, optional: true }`
 *   - `[bar]` -> `{ key: 'bar', repeat: false, optional: false }`
 *   - `fizz` -> `{ key: 'fizz', repeat: false, optional: false }`
 * @param param - The parameter to parse.
 * @returns The parsed parameter as a data structure.
 */
export function parseParameter(param: string) {
  const match = param.match(PARAMETER_PATTERN)

  if (!match) {
    return parseMatchedParameter(param)
  }

  return parseMatchedParameter(match[2])
}

/**
 * Parses a matched parameter from the PARAMETER_PATTERN regex to a data structure that can be used
 * to generate the parametrized route.
 * Examples:
 *   - `[...slug]` -> `{ key: 'slug', repeat: true, optional: true }`
 *   - `...slug` -> `{ key: 'slug', repeat: true, optional: false }`
 *   - `[foo]` -> `{ key: 'foo', repeat: false, optional: true }`
 *   - `bar` -> `{ key: 'bar', repeat: false, optional: false }`
 * @param param - The matched parameter to parse.
 * @returns The parsed parameter as a data structure.
 */
export function parseMatchedParameter(param: string) {
  const optional = param.startsWith('[') && param.endsWith(']')
  if (optional) {
    param = param.slice(1, -1)
  }
  const repeat = param.startsWith('...')
  if (repeat) {
    param = param.slice(3)
  }
  return { key: param, repeat, optional }
}
